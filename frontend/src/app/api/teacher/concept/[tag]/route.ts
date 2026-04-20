/**
 * GET /api/teacher/concept/[tag]
 *
 * Drill-down endpoint for the teacher dashboard. Returns every student
 * who has knowledge_graph data on this canonical concept along with
 * their level / intervention_cost / bottleneck and the last few mentor
 * chat lines that touched this concept_tag.
 *
 * "Needs Attention" must be traceable down to the words the student
 * said and the response the mentor gave — vague aggregate metrics make
 * the dashboard feel like a black box.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { canonicalConceptTag } from "@/lib/ai/concept-canon";

interface ConceptRow {
  level: string;
  attempts: number;
  last_seen: string;
  evidence: string;
  bottleneck?: string;
  misconception?: string | null;
  intervention_cost?: number;
  last_intervention?: { type: string; at: string };
}

interface LearnerRow {
  user_id: string;
  total_sessions: number;
  last_active_at: string | null;
  knowledge_graph: { concepts: Record<string, ConceptRow> };
  profiler_notes: string | null;
}

interface ChatLogRow {
  user_id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: { kind?: string; concept_tag?: string };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await params;
  const tag = canonicalConceptTag(rawTag) ?? rawTag;
  const courseId =
    request.nextUrl.searchParams.get("courseId") ??
    "00000000-0000-0000-0000-000000000001";

  try {
    const sb = createServiceClient();

    const { data: profiles, error } = await sb
      .from("learner_profiles")
      .select(
        "user_id, total_sessions, last_active_at, knowledge_graph, profiler_notes",
      )
      .eq("course_id", courseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const learners = (profiles ?? []) as LearnerRow[];

    // Filter to learners who have THIS concept in their graph.
    const students = learners
      .map((l) => {
        const concept = l.knowledge_graph?.concepts?.[tag];
        if (!concept) return null;
        return {
          userId: l.user_id,
          totalSessions: l.total_sessions,
          lastActive: l.last_active_at,
          level: concept.level,
          attempts: concept.attempts,
          interventionCost: concept.intervention_cost ?? 0,
          lastIntervention: concept.last_intervention,
          evidence: concept.evidence,
          bottleneck: concept.bottleneck ?? "",
          misconception: concept.misconception ?? null,
          profilerNotes: l.profiler_notes,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        // weak first, then high-intervention strong, then moderate
        const levelRank: Record<string, number> = {
          weak: 0,
          moderate: 2,
          strong: 1,
        };
        const la = levelRank[a.level] ?? 3;
        const lb = levelRank[b.level] ?? 3;
        if (la !== lb) return la - lb;
        return b.interventionCost - a.interventionCost;
      });

    // Pull recent mentor + student chat lines that touched this concept,
    // newest first. Cap at 30 so the page stays scannable.
    const studentIds = students.map((s) => s.userId);
    let chatLogs: ChatLogRow[] = [];
    if (studentIds.length > 0) {
      const { data: logs } = await sb
        .from("chat_logs")
        .select("user_id, session_id, role, content, created_at, metadata")
        .eq("course_id", courseId)
        .in("user_id", studentIds)
        .order("created_at", { ascending: false })
        .limit(200);
      chatLogs = ((logs ?? []) as ChatLogRow[]).filter(
        (l) =>
          l.metadata?.concept_tag === tag ||
          (l.metadata?.kind === "checkpoint" &&
            l.metadata?.concept_tag === tag),
      );
    }

    // Group chat logs by student (most recent 5 per student).
    const logsByStudent: Record<string, ChatLogRow[]> = {};
    for (const log of chatLogs) {
      if (!logsByStudent[log.user_id]) logsByStudent[log.user_id] = [];
      if (logsByStudent[log.user_id].length < 5) {
        logsByStudent[log.user_id].push(log);
      }
    }

    return NextResponse.json({
      concept: tag,
      summary: {
        totalStudents: students.length,
        weakCount: students.filter((s) => s.level === "weak").length,
        moderateCount: students.filter((s) => s.level === "moderate").length,
        strongCount: students.filter((s) => s.level === "strong").length,
      },
      students: students.map((s) => ({
        ...s,
        recentLogs: (logsByStudent[s.userId] ?? []).map((l) => ({
          role: l.role,
          content: l.content,
          createdAt: l.created_at,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
