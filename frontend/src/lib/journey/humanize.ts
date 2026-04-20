/**
 * Humanize raw profiler output before showing it to the student.
 *
 * Two-pronged fix: the profiler prompt now requests second-person warm
 * tone (see `frontend/src/lib/ai/profiler.ts`), but rows already
 * written to learner_profiles can be robotic ("Student acknowledges..."
 * "TRICKY STEP 2: ..."). This wrapper rephrases at display time so
 * today's seed data is friendly, and tomorrow's writes flow through
 * unchanged when they're already warm.
 *
 * Lifted from `frontend/src/app/journey/page.tsx` so non-page callers
 * (e.g. the MasteryChart tooltip) can apply the same humanization
 * without importing from a route component.
 */

export type ProfilerField = "bottleneck" | "reasoningStepFailed" | "misconception";

export function humanizeProfilerText(
  field: ProfilerField,
  raw: string | number | null | undefined,
): string {
  if (raw === null || raw === undefined) return "";

  if (typeof raw === "number") {
    if (field === "reasoningStepFailed") {
      return `Step ${raw} of the reasoning chain was the tricky one — you got past it.`;
    }
    return String(raw);
  }

  if (typeof raw !== "string") return String(raw);

  const cleaned = raw
    .replace(/^the\s+student\s+/i, "you ")
    .replace(/\bthe\s+student\b/gi, "you")
    .replace(/^student\s+/i, "you ")
    .replace(/\bsubject\b/gi, "you")
    .replace(/\bTRICKY\s+STEP\s+\d+:?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return raw;

  if (/^(you|your)\b/i.test(cleaned)) {
    return cleaned[0].toUpperCase() + cleaned.slice(1);
  }

  const lower = cleaned[0].toLowerCase() + cleaned.slice(1);

  if (field === "bottleneck") {
    return `You stalled on ${lower}`;
  }
  if (field === "reasoningStepFailed") {
    return `The tricky step was ${lower}`;
  }
  return `Your first instinct was that ${lower} — you got past it.`;
}
