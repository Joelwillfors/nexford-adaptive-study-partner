/**
 * POST /api/admin/dedupe — one-shot concept canonicalization for
 * learner_profiles.knowledge_graph.
 *
 * Replaces the standalone tsx/node script: we piggy-back on Next.js'
 * existing TS toolchain and service-role Supabase client instead of
 * fighting Node ESM path resolution.
 *
 * Protection: dev-only. Outside `NODE_ENV === "development"` the route
 * returns 403 so a prod deploy cannot accidentally rewrite learner data.
 * This is intentionally the simplest gate — real admin endpoints would
 * sit behind auth, but this one is a one-shot migration tool.
 *
 * Semantics:
 *   POST /api/admin/dedupe          → dry run, returns summary, writes nothing
 *   POST /api/admin/dedupe?write=1  → actually persists the canonicalized graph
 *
 * Idempotent. Safe on empty data. Running it twice on already-canonical
 * data is a no-op.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { canonicalConceptTag } from "@/lib/ai/concept-canon";

type Level = "strong" | "moderate" | "weak";
const LEVEL_RANK: Record<Level, number> = { weak: 0, moderate: 1, strong: 2 };

interface StoredConcept {
  level: Level;
  attempts: number;
  last_seen: string;
  evidence?: string;
  bottleneck?: string;
  reasoning_step_failed?: number | null;
  misconception?: string | null;
}

interface KnowledgeGraph {
  concepts: Record<string, StoredConcept>;
}

function pickMaxLevel(a: Level, b: Level): Level {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function laterIso(a: string | undefined, b: string | undefined): string {
  if (!a) return b ?? new Date().toISOString();
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Merge two concepts that canonicalized to the same key. Rules mirror
 * profiler.ts#mergeKnowledgeGraph exactly so historical data is shaped
 * the same way new writes are:
 *   - attempts: sum (total engagements)
 *   - level: ratchet upward (weak < moderate < strong)
 *   - last_seen: later ISO wins
 *   - evidence/bottleneck/reasoning_step_failed/misconception: prefer the
 *     newer (by last_seen) non-empty value; fall back to older
 */
function mergeConcept(a: StoredConcept, b: StoredConcept): StoredConcept {
  const laterWins =
    new Date(b.last_seen ?? 0).getTime() >=
    new Date(a.last_seen ?? 0).getTime();
  const newer = laterWins ? b : a;
  const older = laterWins ? a : b;
  return {
    level: pickMaxLevel(a.level, b.level),
    attempts: (a.attempts ?? 0) + (b.attempts ?? 0),
    last_seen: laterIso(a.last_seen, b.last_seen),
    evidence: newer.evidence || older.evidence || "",
    bottleneck: newer.bottleneck || older.bottleneck || "",
    reasoning_step_failed:
      newer.reasoning_step_failed ?? older.reasoning_step_failed ?? null,
    misconception: newer.misconception ?? older.misconception ?? null,
  };
}

function canonicalizeGraph(graph: KnowledgeGraph): {
  graph: KnowledgeGraph;
  merged: number;
  renamed: number;
} {
  const nextConcepts: Record<string, StoredConcept> = {};
  let merged = 0;
  let renamed = 0;

  for (const [rawKey, concept] of Object.entries(graph.concepts ?? {})) {
    const canonical = canonicalConceptTag(rawKey) ?? rawKey;
    if (canonical !== rawKey) renamed++;
    if (nextConcepts[canonical]) {
      nextConcepts[canonical] = mergeConcept(
        nextConcepts[canonical],
        concept,
      );
      merged++;
    } else {
      nextConcepts[canonical] = concept;
    }
  }

  return { graph: { concepts: nextConcepts }, merged, renamed };
}

interface PerRowSummary {
  userId: string;
  courseId: string;
  before: string[];
  after: string[];
  renamed: number;
  merged: number;
  written: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403 },
    );
  }

  const write = req.nextUrl.searchParams.get("write") === "1";
  const sb = createServiceClient();

  const { data, error } = await sb
    .from("learner_profiles")
    .select("user_id, course_id, knowledge_graph");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const perRow: PerRowSummary[] = [];
  let rowsChanged = 0;
  let totalRenamed = 0;
  let totalMerged = 0;

  for (const row of rows) {
    const before = (row.knowledge_graph as KnowledgeGraph | null) ?? {
      concepts: {},
    };
    const { graph: after, merged, renamed } = canonicalizeGraph(before);

    if (merged === 0 && renamed === 0) continue;

    rowsChanged++;
    totalMerged += merged;
    totalRenamed += renamed;

    const summary: PerRowSummary = {
      userId: row.user_id,
      courseId: row.course_id,
      before: Object.keys(before.concepts ?? {}).sort(),
      after: Object.keys(after.concepts).sort(),
      renamed,
      merged,
      written: false,
    };

    if (write) {
      const { error: upErr } = await sb
        .from("learner_profiles")
        .update({ knowledge_graph: after })
        .eq("user_id", row.user_id)
        .eq("course_id", row.course_id);
      if (upErr) {
        summary.error = upErr.message;
      } else {
        summary.written = true;
      }
    }

    perRow.push(summary);
  }

  return NextResponse.json({
    dryRun: !write,
    rowsScanned: rows.length,
    rowsChanged,
    keysRenamed: totalRenamed,
    duplicatesMerged: totalMerged,
    perRow,
  });
}
