/**
 * Shared planner types — used by /plan/page.tsx, planner-chat.tsx,
 * proactive-nudge.tsx, and the /api/plan/generate response shape.
 */
import type { AvailabilityRule } from "@/lib/calendar/availability-rules";
import type { StudyBand } from "./study-band";

export type SlotKind = "new" | "review" | "practice" | "stretch";

export interface PlanSlot {
  concept: string;
  conceptLabel: string;
  load: 1 | 2 | 3;
  durationMin: number;
  kind: SlotKind;
  rationale: string;
}

export interface PlanDay {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Short label like "Mon". Stable, drives life-event lookup. */
  dayLabel: string;
  totalLoad: number;
  slots: PlanSlot[];
}

export interface WeekPlan {
  studentId: string;
  weekStart: string;
  generatedAt: string;
  source: "live" | "fallback_seed";
  rationaleSummary: string;
  days: PlanDay[];
  /** Sum of `durationMin` across every slot in the week. Anchored to
   *  Nexford's 12–15h success band (see `study-band.ts`). */
  weekTotalMin: number;
  /** Classification of `weekTotalMin` against the Nexford bands. */
  band: StudyBand;
  /** Echoed back from /api/plan/generate so the calendar can render
   *  conversational busy windows alongside seed life events without a
   *  second round-trip. Optional in the type because some legacy
   *  fixtures / older fallbacks may omit it. */
  availabilityRules?: AvailabilityRule[];
}
