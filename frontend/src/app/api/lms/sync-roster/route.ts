import { NextResponse } from "next/server";
import { lmsProvider } from "@/lib/lms";

/**
 * Teacher-facing "Sync Syllabus & Roster from Canvas" — composite read
 * over `getRoster()` + `getSyllabusSummary()`. Today both calls land on
 * `MockCanvasProvider`; the same endpoint hits Canvas live the moment
 * NEXT_PUBLIC_CANVAS_API_BASE_URL is set, no UI changes needed.
 *
 * The 500ms floor matches the student-side `/api/lms/sync-canvas` so
 * the loading-state cadence feels consistent across both surfaces.
 */
export async function POST() {
  try {
    const [roster, syllabus] = await Promise.all([
      lmsProvider.getRoster(),
      lmsProvider.getSyllabusSummary(),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    return NextResponse.json({
      students: roster.studentCount,
      activeStudents: roster.activeCount,
      modules: syllabus.moduleCount,
      assignments: syllabus.assignmentCount,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Roster sync failed",
      },
      { status: 502 },
    );
  }
}
