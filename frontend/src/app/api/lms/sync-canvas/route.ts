import { NextResponse } from "next/server";
import { lmsProvider } from "@/lib/lms";

/**
 * Student-facing "Import schedule from Canvas" — re-pulls the upcoming
 * lectures and assignments via the resolved `LMSProvider`. Today that
 * provider is `MockCanvasProvider`; the moment NEXT_PUBLIC_CANVAS_API_BASE_URL
 * is set, the same call hits Canvas live with zero UI changes. The point
 * of this endpoint is to make the read-direction of the LMS integration
 * tactile in the demo (loading state + toast), not to actually mutate
 * client state — the calendar already renders Canvas-sourced events with
 * a "via Canvas" provenance pill.
 */
export async function POST() {
  try {
    const [modules, assignments] = await Promise.all([
      lmsProvider.getModules(),
      lmsProvider.getAssignments({ from: new Date() }),
    ]);

    // Brief deliberate delay so the loading state is perceptible. Real
    // Canvas latency is 200–600ms; a 500ms floor matches that without
    // tipping into "feels broken".
    await new Promise((resolve) => setTimeout(resolve, 500));

    const upcomingLectures = modules.filter((m) => m.status !== "completed").length;
    const upcomingAssignments = assignments.filter((a) => !a.completed).length;

    return NextResponse.json({
      lectures: upcomingLectures,
      assignments: upcomingAssignments,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Canvas sync failed",
      },
      { status: 502 },
    );
  }
}
