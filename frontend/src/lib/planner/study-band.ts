/**
 * Study-band constants — Nexford's 12–15h weekly success target made shared.
 *
 * Single source of truth for:
 *   - the per-day cognitive-load cap (DAILY_LOAD_BUDGET) used by the deterministic
 *     planner and surfaced in the UI day-column pill,
 *   - the weekly minute thresholds that classify a generated plan into a
 *     human-readable band (risk / on_track / stretch / ceiling),
 *   - the natural-language sentence Atlas appends to its reply after every
 *     plan-changing tool call.
 *
 * Anchors (Nexford's own student-facing materials):
 *   - 10h/week is the floor for "successful" engagement.
 *   - 12–15h/week is the band Nexford's most successful learners sustain.
 *   - 20h/week is treated as the absolute ceiling here — anything more stops
 *     being sustainable for an adult degree learner with a job and a life.
 *
 * The Risk band (`< 10h`) is the seam the Profiler will consume in a follow-up
 * pass to flag "silent middle" students before login frequency moves. For now
 * it's plumbing only — the classifier returns the band; nobody auto-triggers.
 */

/** Cognitive-load points a single day can absorb. Concept loads are 1..3. */
export const DAILY_LOAD_BUDGET = 3;

/** Floor of the 12–15h success band, in minutes. */
export const WEEKLY_TARGET_MIN_LOW = 720;

/** Top of the 12–15h success band, in minutes. */
export const WEEKLY_TARGET_MIN_HIGH = 900;

/** Hard cap — the planner will not place a slot that pushes the week past this. */
export const WEEKLY_CEILING_MIN = 1200;

/** Below this threshold the plan is flagged Risk (Profiler hook). */
export const WEEKLY_RISK_FLOOR_MIN = 600;

export type StudyBand = "risk" | "on_track" | "stretch" | "ceiling";

export function classifyBand(weekTotalMin: number): StudyBand {
  if (weekTotalMin < WEEKLY_RISK_FLOOR_MIN) return "risk";
  if (weekTotalMin >= WEEKLY_CEILING_MIN) return "ceiling";
  if (weekTotalMin > WEEKLY_TARGET_MIN_HIGH) return "stretch";
  return "on_track";
}

/**
 * The single sentence Atlas appends to its reply after a plan-changing tool
 * call. Wording adapts to the band so the message stays honest when the week
 * is under-filled, over-filled, or capped.
 */
export function bandMessageFor(
  band: StudyBand,
  weekTotalMin: number,
): string {
  const hours = (weekTotalMin / 60).toFixed(1).replace(/\.0$/, "");
  switch (band) {
    case "on_track":
      return `I've blocked out ${hours} hours for you this week. Our most successful learners follow a structured schedule of 12–15 dedicated learning hours per week, so you're exactly on track for success.`;
    case "stretch":
      return `I've blocked out ${hours} hours for you this week — above Nexford's 12–15h success band. That's a stretch week; make sure you're protecting recovery time.`;
    case "ceiling":
      return `I've blocked out ${hours} hours for you this week — at the 20-hour ceiling. Anything more and the week stops being sustainable; the planner won't add another block.`;
    case "risk":
      return `I've blocked out ${hours} hours for you this week — under the 10-hour floor Nexford recommends. Tell me what changed and I'll find more time.`;
  }
}
