/**
 * POST /api/plan/generate — Planner Agent endpoint.
 *
 * Body: { studentId, courseId, weekStart? }
 *
 * Returns a deterministic 7-day plan derived from the student's
 * knowledge_graph. Live path reads from learner_profiles; on any
 * Supabase failure or DEMO_MODE we return the hand-seeded Sara plan
 * so the demo never lands on an empty state.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import {
  generateWeeklyPlanForStudent,
  fallbackSeedPlan,
} from "@/lib/ai/planner-agent";
import { DEMO_MODE } from "@/lib/flags";
import { DEMO_COURSE_ID, DEMO_STUDENT } from "@/lib/demo-identity";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      studentId?: string;
      courseId?: string;
      weekStart?: string;
    };

    const studentId = body.studentId ?? DEMO_STUDENT.id;
    const courseId = body.courseId ?? DEMO_COURSE_ID;
    const weekStart = body.weekStart;

    if (DEMO_MODE) {
      return NextResponse.json(fallbackSeedPlan(weekStart));
    }

    try {
      const sb = createServiceClient();
      const plan = await generateWeeklyPlanForStudent(sb, {
        studentId,
        courseId,
        weekStart,
      });
      // If the student has no knowledge_graph entries, the plan is just
      // "all new" — that's a valid demo state, but for the hosted
      // demo cohort we'd rather show Sara's seeded plan with concrete
      // weak/strong shading. Detect "no engagement yet" and substitute.
      const totalEngagement = plan.days.reduce(
        (a, d) => a + d.totalLoad,
        0,
      );
      if (totalEngagement === 0) {
        return NextResponse.json(fallbackSeedPlan(weekStart));
      }
      return NextResponse.json(plan);
    } catch (err) {
      console.error("[Planner] live failure, returning seed:", err);
      return NextResponse.json(fallbackSeedPlan(weekStart));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
