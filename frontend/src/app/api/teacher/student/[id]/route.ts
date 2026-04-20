/**
 * GET /api/teacher/student/[id]
 *
 * Per-student teacher drilldown. Reads the full knowledge_graph for one
 * learner_profile and returns the slices a teacher cares about:
 *   - summary (level, sessions, last active)
 *   - counts (weak / moderate / strong / total)
 *   - weakConcepts: every concept currently flagged weak, sorted by
 *     attempts desc → last_seen desc, with optional bottleneck excerpt
 *   - misconceptions: concepts that have a structured misconception
 *     string from the Profiler
 *
 * Powers two surfaces: the inline "Bottlenecks" sub-panel inside the
 * watchlist row, and the dedicated /teacher/student/[id] page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { formatConcept } from "@/components/teacher/types";

interface ConceptRow {
  level: string;
  attempts: number;
  last_seen: string;
  evidence: string;
  bottleneck?: string;
  misconception?: string | null;
  intervention_cost?: number;
}

interface LearnerRow {
  user_id: string;
  overall_level: string;
  total_sessions: number;
  last_active_at: string | null;
  knowledge_graph: { concepts: Record<string, ConceptRow> };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params;
  const courseId =
    request.nextUrl.searchParams.get("courseId") ??
    "00000000-0000-0000-0000-000000000001";

  try {
    const sb = createServiceClient();

    const { data, error } = await sb
      .from("learner_profiles")
      .select(
        "user_id, overall_level, total_sessions, last_active_at, knowledge_graph",
      )
      .eq("course_id", courseId)
      .eq("user_id", studentId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Student not found in this course" },
        { status: 404 },
      );
    }

    const learner = data as LearnerRow;
    const concepts = learner.knowledge_graph?.concepts ?? {};
    const entries = Object.entries(concepts);

    const counts = {
      weak: entries.filter(([, c]) => c.level === "weak").length,
      moderate: entries.filter(([, c]) => c.level === "moderate").length,
      strong: entries.filter(([, c]) => c.level === "strong").length,
      total: entries.length,
    };

    const weakConcepts = entries
      .filter(([, c]) => c.level === "weak")
      .sort(([, a], [, b]) => {
        const attemptDiff = (b.attempts ?? 0) - (a.attempts ?? 0);
        if (attemptDiff !== 0) return attemptDiff;
        const aAt = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bAt = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bAt - aAt;
      })
      .map(([tag, c]) => ({
        tag,
        label: formatConcept(tag),
        attempts: c.attempts ?? 0,
        lastSeen: c.last_seen ?? null,
        bottleneck: c.bottleneck || undefined,
        misconception: c.misconception || undefined,
      }));

    const misconceptions = entries
      .filter(([, c]) => !!c.misconception)
      .sort(([, a], [, b]) => {
        const aAt = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bAt = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bAt - aAt;
      })
      .map(([tag, c]) => ({
        tag,
        label: formatConcept(tag),
        text: c.misconception as string,
        lastSeen: c.last_seen ?? null,
      }));

    return NextResponse.json({
      studentId: learner.user_id,
      level: learner.overall_level,
      sessions: learner.total_sessions,
      lastActive: learner.last_active_at,
      counts,
      weakConcepts,
      misconceptions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
