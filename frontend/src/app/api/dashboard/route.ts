/**
 * GET /api/dashboard — Teacher Digest data endpoint.
 *
 * Aggregates learner_profiles and chat_logs for a course to produce
 * the "Morning Digest" summary from PRODUCT_SPEC.md:
 *   - Total students who interacted
 *   - Breakdown by understanding level
 *   - "Action Required" list: students repeatedly stuck
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { computeRiskScore } from "@/lib/risk";

interface LearnerProfile {
  id: string;
  user_id: string;
  overall_level: string;
  total_sessions: number;
  last_active_at: string | null;
  knowledge_graph: {
    concepts: Record<
      string,
      {
        level: string;
        attempts: number;
        last_seen: string;
        evidence: string;
        intervention_cost?: number;
        last_intervention?: {
          type: "direct_mode" | "quiz_fail" | "topic_closed";
          at: string;
        };
      }
    >;
  };
  profiler_notes: string | null;
}

export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("courseId") ??
    "00000000-0000-0000-0000-000000000001";

  try {
    const sb = createServiceClient();

    // Fetch all learner profiles for this course
    const { data: profiles, error } = await sb
      .from("learner_profiles")
      .select("*")
      .eq("course_id", courseId)
      .order("last_active_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const learners = (profiles ?? []) as LearnerProfile[];

    // Filter to students active in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activeRecently = learners.filter(
      (l) => l.last_active_at && l.last_active_at >= yesterday,
    );

    // Breakdown by level
    const strong = activeRecently.filter((l) => l.overall_level === "strong");
    const moderate = activeRecently.filter(
      (l) => l.overall_level === "moderate",
    );
    const weak = activeRecently.filter((l) => l.overall_level === "weak");

    // "Action Required": students who are weak AND have 3+ sessions
    // (repeatedly stuck despite Socratic guidance)
    const actionRequired = learners
      .filter((l) => l.overall_level === "weak" && l.total_sessions >= 3)
      .map((l) => {
        const weakConcepts = Object.entries(l.knowledge_graph?.concepts ?? {})
          .filter(([, v]) => v.level === "weak")
          .map(([k, v]) => ({ concept: k, attempts: v.attempts, evidence: v.evidence }));

        return {
          userId: l.user_id,
          totalSessions: l.total_sessions,
          lastActive: l.last_active_at,
          weakConcepts,
          profilerNotes: l.profiler_notes,
        };
      });

    // Aggregate struggling concepts across all action-required students
    const stuckConceptCounts: Record<string, number> = {};
    for (const student of actionRequired) {
      for (const wc of student.weakConcepts) {
        stuckConceptCounts[wc.concept] =
          (stuckConceptCounts[wc.concept] ?? 0) + 1;
      }
    }
    const sharedMisconceptions = Object.entries(stuckConceptCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([concept, count]) => ({ concept, studentCount: count }));

    // Enrich each student with a dropout-risk snapshot so the teacher
    // page can render a R/Y/G watchlist without re-fetching profiles.
    const now = new Date();
    const allStudents = learners.map((l) => {
      const risk = computeRiskScore({
        knowledgeGraph: l.knowledge_graph,
        totalSessions: l.total_sessions,
        lastActive: l.last_active_at,
        now,
      });
      // Surface up to three weakest concepts (by attempts desc, then
      // last_seen desc) so the watchlist row can show *which* concepts
      // are dragging the score without forcing teachers to expand the
      // row first.
      const topWeakConcepts = Object.entries(l.knowledge_graph?.concepts ?? {})
        .filter(([, c]) => c.level === "weak")
        .sort(([, a], [, b]) => {
          const attemptDiff = (b.attempts ?? 0) - (a.attempts ?? 0);
          if (attemptDiff !== 0) return attemptDiff;
          const aAt = a.last_seen ? new Date(a.last_seen).getTime() : 0;
          const bAt = b.last_seen ? new Date(b.last_seen).getTime() : 0;
          return bAt - aAt;
        })
        .slice(0, 3)
        .map(([tag]) => tag);
      return {
        userId: l.user_id,
        level: l.overall_level,
        sessions: l.total_sessions,
        lastActive: l.last_active_at,
        conceptCount: Object.keys(l.knowledge_graph?.concepts ?? {}).length,
        topWeakConcepts,
        risk,
      };
    });
    const atRiskCount = allStudents.filter(
      (s) => s.risk.band !== "green",
    ).length;

    // Reviews-Sent (7d): count of gradebook_exports rows for this course
    // in the trailing 7 days. Each row is a unique (student, concept, day)
    // intervention so this is the honest "how many times did the teacher
    // act on what they saw" number. Failure here is non-fatal — if the
    // table doesn't exist yet (older env) we fall through to 0 so the
    // dashboard still renders.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString();
    let reviewsSent7d = 0;
    try {
      const { count } = await sb
        .from("gradebook_exports")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .gte("created_at", sevenDaysAgo);
      reviewsSent7d = count ?? 0;
    } catch {
      reviewsSent7d = 0;
    }

    // Hard-Earned Mastery (Phase 3 Block A): per-(student, concept)
    // tuples where the student now reads as STRONG but their road there
    // cost ≥3 interventions (direct-mode entry, quiz fail, or
    // topic_closed). This is the "dual-scoring" surface — student-side
    // copy says "you got it"; teacher sees the receipts.
    interface HardEarnedRow {
      userId: string;
      concept: string;
      interventionCost: number;
      lastIntervention?: { type: string; at: string };
      attempts: number;
      lastSeen: string;
    }
    const hardEarnedMastery: HardEarnedRow[] = [];
    const HARD_EARNED_THRESHOLD = 3;
    for (const learner of learners) {
      for (const [conceptTag, c] of Object.entries(
        learner.knowledge_graph?.concepts ?? {},
      )) {
        const cost = c.intervention_cost ?? 0;
        if (c.level === "strong" && cost >= HARD_EARNED_THRESHOLD) {
          hardEarnedMastery.push({
            userId: learner.user_id,
            concept: conceptTag,
            interventionCost: cost,
            lastIntervention: c.last_intervention,
            attempts: c.attempts,
            lastSeen: c.last_seen,
          });
        }
      }
    }
    hardEarnedMastery.sort(
      (a, b) => b.interventionCost - a.interventionCost,
    );

    return NextResponse.json({
      courseId,
      period: { since: yesterday, until: new Date().toISOString() },
      summary: {
        totalStudents: learners.length,
        activeRecently: activeRecently.length,
        strong: strong.length,
        moderate: moderate.length,
        weak: weak.length,
        atRiskCount,
        reviewsSent7d,
      },
      actionRequired,
      sharedMisconceptions,
      allStudents,
      hardEarnedMastery,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
