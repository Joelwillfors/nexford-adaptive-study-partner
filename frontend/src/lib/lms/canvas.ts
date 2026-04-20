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

const NOT_CONFIGURED =
  "CanvasProvider not configured. Set NEXT_PUBLIC_CANVAS_API_BASE_URL and CANVAS_API_TOKEN to enable live Canvas calls. The demo runs against MockCanvasProvider — see Docs/ROADMAP.md > Tier 1.2 for the contract.";

/**
 * Live Canvas REST + LTI 1.3 implementation. Intentionally a stub for v1:
 * every method throws with the same actionable error. Wiring this up is
 * Tier 2 work (institutional sales motion + tenant onboarding) — what
 * we ship now is the contract this class satisfies, so the swap from
 * Mock to Live is a one-line factory change in `./index.ts`, not a
 * rewrite of every page.
 *
 * When implemented:
 *   - getModules → GET /api/v1/courses/:id/modules
 *   - getAssignments → GET /api/v1/courses/:id/assignments
 *   - getStudentId → resolved from LTI launch claim `sub`
 *   - exportToGradebook → POST /api/v1/courses/:id/assignments/:aid/submissions/:uid
 *     PLUS the local `gradebook_exports` row stays as the audit trail
 */
export class CanvasProvider implements LMSProvider {
  async getCurrentCourse(): Promise<Course> {
    throw new Error(NOT_CONFIGURED);
  }
  async getModules(): Promise<ModuleSummary[]> {
    throw new Error(NOT_CONFIGURED);
  }
  async getAssignments(): Promise<Assignment[]> {
    throw new Error(NOT_CONFIGURED);
  }
  async getLastQuizScore(_studentId: string): Promise<LastQuizScore | null> {
    throw new Error(NOT_CONFIGURED);
  }
  async getStudentId(): Promise<string> {
    throw new Error(NOT_CONFIGURED);
  }
  async exportToGradebook(
    _input: GradebookExportInput,
  ): Promise<GradebookExportResult> {
    throw new Error(NOT_CONFIGURED);
  }
  async getRoster(): Promise<RosterSummary> {
    throw new Error(NOT_CONFIGURED);
  }
  async getSyllabusSummary(): Promise<SyllabusSummary> {
    throw new Error(NOT_CONFIGURED);
  }
  async getHealth(): Promise<ProviderHealth> {
    return {
      name: "Canvas (Live)",
      mode: "live",
      configured: false,
      lastSyncedAt: new Date(0).toISOString(),
    };
  }
}
