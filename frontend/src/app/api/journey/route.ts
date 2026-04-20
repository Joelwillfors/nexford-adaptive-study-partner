/**
 * GET /api/journey — Student Learning Journey data endpoint.
 *
 * Reads the current demo student's learner_profiles.knowledge_graph and
 * flattens the per-concept JSONB into an array suitable for the Journey
 * page's Recharts visualization. Pure read — no LLM calls, no writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { DEMO_COURSE_ID, DEMO_STUDENT } from "@/lib/demo-identity";

type ConceptLevel = "strong" | "moderate" | "weak";

interface StoredConcept {
  level?: string;
  attempts?: number;
  last_seen?: string;
  evidence?: string;
  bottleneck?: string;
  reasoning_step_failed?: string | number;
  misconception?: string;
}

interface LearnerProfileRow {
  user_id: string;
  overall_level: string | null;
  total_sessions: number | null;
  last_active_at: string | null;
  knowledge_graph: {
    concepts?: Record<string, StoredConcept>;
  } | null;
}

function formatConceptTag(tag: string): string {
  return tag
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeLevel(raw: string | undefined): ConceptLevel {
  if (raw === "strong" || raw === "moderate" || raw === "weak") return raw;
  return "weak";
}

function levelToScore(level: ConceptLevel): number {
  if (level === "strong") return 3;
  if (level === "moderate") return 2;
  return 1;
}

export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("courseId") ?? DEMO_COURSE_ID;
  const studentId =
    request.nextUrl.searchParams.get("studentId") ?? DEMO_STUDENT.id;

  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("learner_profiles")
      .select(
        "user_id, overall_level, total_sessions, last_active_at, knowledge_graph",
      )
      .eq("user_id", studentId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profile = data as LearnerProfileRow | null;
    const storedConcepts = profile?.knowledge_graph?.concepts ?? {};

    const concepts = Object.entries(storedConcepts).map(([tag, raw]) => {
      const level = normalizeLevel(raw?.level);
      return {
        tag,
        name: formatConceptTag(tag),
        level,
        levelScore: levelToScore(level),
        attempts: typeof raw?.attempts === "number" ? raw.attempts : 0,
        lastSeen: raw?.last_seen ?? null,
        bottleneck: raw?.bottleneck ?? null,
        reasoningStepFailed: raw?.reasoning_step_failed ?? null,
        misconception: raw?.misconception ?? null,
      };
    });

    // Sort weakest first so the struggle points are at the top of the chart
    // and the student sees what to work on before the wins.
    concepts.sort((a, b) => a.levelScore - b.levelScore);

    const stats = {
      mastered: concepts.filter((c) => c.level === "strong").length,
      inProgress: concepts.filter((c) => c.level === "moderate").length,
      struggling: concepts.filter((c) => c.level === "weak").length,
    };

    return NextResponse.json({
      courseId,
      studentId,
      overallLevel: (profile?.overall_level as ConceptLevel) ?? "unknown",
      totalSessions: profile?.total_sessions ?? 0,
      lastActive: profile?.last_active_at ?? null,
      concepts,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
