/**
 * Single point of LMS resolution. Every page composes against this
 * `lmsProvider` export — the choice between Mock and Live happens
 * exactly once, here, based on env. This is the architectural contract
 * the demo's "Connected to Canvas · Mock data" pill is reading from.
 *
 * Selection rule:
 *   - NEXT_PUBLIC_CANVAS_API_BASE_URL set → CanvasProvider (live)
 *   - otherwise                          → MockCanvasProvider
 */
import { CanvasProvider } from "./canvas";
import { MockCanvasProvider } from "./mock-canvas";
import type { LMSProvider } from "./provider";

function resolveProvider(): LMSProvider {
  const liveUrl = process.env.NEXT_PUBLIC_CANVAS_API_BASE_URL?.trim();
  if (liveUrl) return new CanvasProvider();
  return new MockCanvasProvider();
}

export const lmsProvider: LMSProvider = resolveProvider();

export type {
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
} from "./provider";
