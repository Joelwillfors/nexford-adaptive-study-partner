import type {
  Assignment,
  Course,
  GradebookExportInput,
  GradebookExportResult,
  LastQuizScore,
  LMSProvider,
  ModuleSummary,
  ProviderHealth,
  RosterSummary,
  SyllabusSummary,
} from "@/lib/lms/provider";
import { createServiceClient } from "@/lib/supabase/clients";

const DEMO_STUDENT_ID = "sara-patel";

const COURSE: Course = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "Business Fundamentals",
  code: "BUS-101",
};

const MODULES: ModuleSummary[] = [
  {
    id: "module-1",
    number: 1,
    title: "What is Accounting?",
    status: "completed",
    estimatedMinutes: 35,
  },
  {
    id: "module-2",
    number: 2,
    title: "The Accounting Equation",
    status: "completed",
    estimatedMinutes: 45,
  },
  {
    id: "module-3",
    number: 3,
    title: "Accrual vs Cash Accounting",
    status: "active",
    estimatedMinutes: 50,
    deadline: "Fri, 11:59 PM",
  },
  {
    id: "module-4",
    number: 4,
    title: "The Matching Principle",
    status: "upcoming",
    estimatedMinutes: 40,
  },
  {
    id: "module-5",
    number: 5,
    title: "Revenue Recognition",
    status: "upcoming",
    estimatedMinutes: 45,
  },
  {
    id: "module-6",
    number: 6,
    title: "Balance Sheet Analysis",
    status: "upcoming",
    estimatedMinutes: 60,
  },
];

const now = Date.now();
const DAY = 1000 * 60 * 60 * 24;

const ASSIGNMENTS: Assignment[] = [
  {
    id: "a-1",
    moduleId: "module-3",
    title: "Accrual vs Cash — Reading + Quiz",
    dueAt: new Date(now + 3 * DAY).toISOString(),
    type: "quiz",
    completed: false,
  },
  {
    id: "a-2",
    moduleId: "module-4",
    title: "Matching Principle — Case Study",
    dueAt: new Date(now + 7 * DAY).toISOString(),
    type: "project",
    completed: false,
  },
  {
    id: "a-3",
    moduleId: "module-5",
    title: "Revenue Recognition — Reading",
    dueAt: new Date(now + 10 * DAY).toISOString(),
    type: "reading",
    completed: false,
  },
  {
    id: "a-4",
    moduleId: "module-2",
    title: "Accounting Equation — Quiz",
    dueAt: new Date(now - 5 * DAY).toISOString(),
    type: "quiz",
    completed: true,
  },
];

export class MockCanvasProvider implements LMSProvider {
  async getCurrentCourse() {
    return COURSE;
  }
  async getModules() {
    return MODULES;
  }
  async getAssignments(opts?: { from?: Date; to?: Date }) {
    const from = opts?.from?.getTime() ?? -Infinity;
    const to = opts?.to?.getTime() ?? Infinity;
    return ASSIGNMENTS.filter((a) => {
      const t = new Date(a.dueAt).getTime();
      return t >= from && t <= to;
    });
  }
  async getLastQuizScore(_studentId: string): Promise<LastQuizScore | null> {
    return {
      moduleId: "module-2",
      score: 67,
      concept: "The Accounting Equation",
      takenAt: new Date(now - 5 * DAY).toISOString(),
    };
  }
  async getStudentId() {
    return DEMO_STUDENT_ID;
  }

  async exportToGradebook(
    input: GradebookExportInput,
  ): Promise<GradebookExportResult> {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = createServiceClient();

    // Idempotent: the (course, student, concept, day) unique constraint
    // makes a re-click on the same day a no-op. We detect that case by
    // doing the upsert with `ignoreDuplicates: true`, then reading back
    // the row to find out which path we took.
    const insertPayload = {
      course_id: COURSE.id,
      student_id: input.studentId,
      concept_tag: input.conceptTag,
      exported_for_day: today,
      intervention_kind: input.interventionKind ?? "review_nudge",
      exported_by: input.exportedBy ?? null,
      payload: input.payload ?? {},
      provider: "mock_canvas",
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("gradebook_exports")
      .insert(insertPayload)
      .select("id")
      .single();

    if (!insertErr && inserted) {
      return {
        id: inserted.id as string,
        status: "created",
        exportedForDay: today,
        provider: "mock_canvas",
      };
    }

    // Postgres unique-violation = 23505. Treat that as the idempotent
    // "already exported today" success path; everything else is a real
    // error worth surfacing.
    const isDuplicate =
      typeof insertErr?.code === "string" && insertErr.code === "23505";
    if (!isDuplicate) {
      throw new Error(
        `gradebook_exports insert failed: ${insertErr?.message ?? "unknown"}`,
      );
    }

    const { data: existing, error: readErr } = await supabase
      .from("gradebook_exports")
      .select("id")
      .eq("course_id", COURSE.id)
      .eq("student_id", input.studentId)
      .eq("concept_tag", input.conceptTag)
      .eq("exported_for_day", today)
      .single();
    if (readErr || !existing) {
      throw new Error(
        `gradebook_exports duplicate but row not readable: ${readErr?.message ?? "missing"}`,
      );
    }
    return {
      id: existing.id as string,
      status: "already_sent_today",
      exportedForDay: today,
      provider: "mock_canvas",
    };
  }

  async getRoster(): Promise<RosterSummary> {
    // Matches the seeded `summary.totalStudents` the dashboard already
    // surfaces, so the toast number lines up with the metric card.
    return {
      studentCount: 42,
      activeCount: 28,
    };
  }

  async getSyllabusSummary(): Promise<SyllabusSummary> {
    return {
      moduleCount: MODULES.length,
      assignmentCount: ASSIGNMENTS.length,
    };
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      name: "Canvas (Mock)",
      mode: "mock",
      configured: true,
      lastSyncedAt: new Date().toISOString(),
    };
  }
}

export const mockCanvas = new MockCanvasProvider();
