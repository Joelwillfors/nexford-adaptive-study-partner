/**
 * LMSProvider — abstract interface over a Learning Management System.
 *
 * Today: MockCanvasProvider returns seeded fixtures and writes interventions
 * to the local `gradebook_exports` table.
 * Tomorrow: CanvasProvider implements this same interface against the
 * Canvas REST API + LTI 1.3 grade passback (see `ltijs`). The swap is a
 * provider change, not a UI rewrite — every page composes against
 * `lmsProvider` from `./index`.
 */

export interface Course {
  id: string;
  title: string;
  code: string;
}

export interface ModuleSummary {
  id: string;
  number: number;
  title: string;
  status: "completed" | "active" | "upcoming";
  estimatedMinutes: number;
  deadline?: string;
}

export interface Assignment {
  id: string;
  moduleId: string;
  title: string;
  dueAt: string;
  type: "reading" | "quiz" | "project";
  completed: boolean;
}

export interface LastQuizScore {
  moduleId: string;
  score: number;
  concept: string;
  takenAt: string;
}

export interface GradebookExportInput {
  studentId: string;
  conceptTag: string;
  interventionKind?: "review_nudge" | "remediation_module" | "direct_message";
  exportedBy?: string;
  payload?: Record<string, unknown>;
}

export interface GradebookExportResult {
  id: string;
  status: "created" | "already_sent_today";
  exportedForDay: string; // ISO date (YYYY-MM-DD)
  provider: string;
}

export interface ProviderHealth {
  name: string;
  mode: "mock" | "live";
  configured: boolean;
  lastSyncedAt: string;
}

/** Shape returned by `getRoster()` — a teacher-side composite view of who
 *  is in the course right now. The mock version reads from seed data; a
 *  live Canvas implementation would call `GET /api/v1/courses/:id/users`
 *  with `enrollment_type=student`. */
export interface RosterSummary {
  studentCount: number;
  activeCount: number;
}

/** Shape returned by `getSyllabusSummary()` — the modules + assignments
 *  side of the same teacher sync flow. Live Canvas: combine the existing
 *  modules and assignments endpoints we already wrap. */
export interface SyllabusSummary {
  moduleCount: number;
  assignmentCount: number;
}

export interface LMSProvider {
  getCurrentCourse(): Promise<Course>;
  getModules(): Promise<ModuleSummary[]>;
  getAssignments(opts?: { from?: Date; to?: Date }): Promise<Assignment[]>;
  getLastQuizScore(studentId: string): Promise<LastQuizScore | null>;
  getStudentId(): Promise<string>;
  /**
   * Idempotent export of a teacher intervention to the LMS gradebook.
   * MockCanvasProvider writes to `public.gradebook_exports` and is the
   * source of truth during the demo. CanvasProvider will additionally
   * call the Canvas REST API; the local row stays as the audit trail.
   */
  exportToGradebook(input: GradebookExportInput): Promise<GradebookExportResult>;
  /**
   * Teacher-side "Sync Syllabus & Roster from Canvas" — composite reads
   * for the dashboard sync button. Kept as two methods (not one combined
   * call) so a live Canvas implementation can parallelise them or cache
   * the syllabus aggressively while the roster ticks more often.
   */
  getRoster(): Promise<RosterSummary>;
  getSyllabusSummary(): Promise<SyllabusSummary>;
  /**
   * Surface for the navbar pill: which provider is wired and when did
   * we last hear from it. Health is intentionally cheap (no network).
   */
  getHealth(): Promise<ProviderHealth>;
}
