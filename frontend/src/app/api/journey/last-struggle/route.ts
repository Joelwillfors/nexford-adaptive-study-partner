import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { DEMO_COURSE_ID, DEMO_STUDENT } from "@/lib/demo-identity";
import { DEMO_MODE } from "@/lib/flags";

/**
 * GET /api/journey/last-struggle
 *
 * Powers the proactive "want a 5-min review?" nudge on /plan and the
 * home portal. Returns the most recent concept where the student
 * needed real intervention (cost >= 2) AND has been seen recently.
 *
 * Hybrid strategy:
 *   - Live: read learner_profiles, find the concept with the highest
 *     intervention_cost amongst the last 7 days of last_intervention.
 *     Tie-break by last_intervention.at descending.
 *   - Fallback: if no qualifying concept (or DEMO_MODE), return a
 *     hand-seeded { concept: "depreciation" } so the demo always has
 *     a banner to show.
 */

const FALLBACK = {
  concept: "accrual_vs_cash",
  label: "Accrual vs Cash",
  lastSeen: null as string | null,
  interventionCost: 3,
  source: "demo_seed" as const,
};

interface StoredConcept {
  level?: string;
  intervention_cost?: number;
  last_intervention?: { type?: string; at?: string };
  last_seen?: string;
}

interface ProfileRow {
  knowledge_graph: { concepts?: Record<string, StoredConcept> } | null;
}

function formatConceptTag(tag: string): string {
  return tag
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("courseId") ?? DEMO_COURSE_ID;
  const studentId =
    request.nextUrl.searchParams.get("studentId") ?? DEMO_STUDENT.id;

  if (DEMO_MODE) {
    return NextResponse.json(FALLBACK);
  }

  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("learner_profiles")
      .select("knowledge_graph")
      .eq("user_id", studentId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (error) throw error;
    const concepts = (data as ProfileRow | null)?.knowledge_graph?.concepts ?? {};

    const cutoff = Date.now() - 7 * 86400_000;
    const candidates = Object.entries(concepts)
      .map(([tag, raw]) => ({
        tag,
        cost: typeof raw.intervention_cost === "number" ? raw.intervention_cost : 0,
        at: raw.last_intervention?.at ?? raw.last_seen ?? null,
      }))
      .filter((c) => c.cost >= 2)
      .filter((c) => {
        if (!c.at) return false;
        const t = new Date(c.at).getTime();
        return Number.isFinite(t) && t >= cutoff;
      })
      .sort((a, b) => {
        if (b.cost !== a.cost) return b.cost - a.cost;
        return new Date(b.at!).getTime() - new Date(a.at!).getTime();
      });

    const top = candidates[0];
    if (!top) {
      return NextResponse.json(FALLBACK);
    }

    return NextResponse.json({
      concept: top.tag,
      label: formatConceptTag(top.tag),
      lastSeen: top.at,
      interventionCost: top.cost,
      source: "live" as const,
    });
  } catch (err) {
    console.error("[last-struggle] failed, returning fallback", err);
    return NextResponse.json(FALLBACK);
  }
}
