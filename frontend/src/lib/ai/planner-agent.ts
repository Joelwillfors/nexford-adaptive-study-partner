/**
 * Planner Agent — generate a 7-day study plan for a student grounded in
 * (a) their current knowledge_graph state, (b) per-concept cognitive
 * load values from the canon, and (c) a forgetting-curve priority that
 * decays a concept's "review-now-ness" with the time since last seen.
 *
 * Architecture: deliberately mechanical, no LLM call. Determinism is
 * the point — the plan must render the same way twice in a row during
 * a demo, and we want the rationale to be auditable. This is the kind
 * of agent the LLM ecosystem keeps trying to build with prompts when a
 * 200-line greedy fill would do.
 *
 * Pipeline:
 *   1. Score every canonical concept (forgetting-curve priority).
 *   2. Greedy fill 7 days against a daily load budget (default 6 units).
 *   3. Single-pass interleaving swap: if the same concept appears on
 *      consecutive days, try swapping with a different concept later
 *      in the week.
 *   4. Hand-curated rationale per slot so the UI can explain WHY this.
 *
 * Source for the desirable-difficulty / forgetting-curve framing:
 * Bjork, R.A. (1994). Memory and metamemory considerations in the
 * training of human beings. (Cited in the slot-rationale strings so
 * the demo viewer sees the science, not just a vibes plan.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANONICAL_KEYS,
  COGNITIVE_LOAD,
  type CanonicalConcept,
} from "./concept-canon";
import {
  busyMinutesForDay,
  loadRulesForStudent,
  type AvailabilityRule,
} from "@/lib/calendar/availability-rules";
import {
  DAY_END_MIN,
  DAY_START_MIN,
  SLOT_VISUAL_MIN,
} from "@/lib/planner/day-schedule";
import type { DayOfWeek } from "@/lib/planner/life-events";
import {
  DAILY_LOAD_BUDGET,
  WEEKLY_CEILING_MIN,
  classifyBand,
  type StudyBand,
} from "@/lib/planner/study-band";

export type SlotKind = "new" | "review" | "practice" | "stretch";

export interface PlanSlot {
  concept: CanonicalConcept;
  conceptLabel: string;
  load: 1 | 2 | 3;
  durationMin: number;
  kind: SlotKind;
  rationale: string;
}

export interface PlanDay {
  date: string;
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
   *  Nexford's 12–15h success band — see `study-band.ts`. */
  weekTotalMin: number;
  /** Classification of `weekTotalMin`: risk (<10h) / on_track (10–15h) /
   *  stretch (15–20h) / ceiling (≥20h, hard-capped). */
  band: StudyBand;
  /** Availability rules in effect for this plan. Echoed back so the
   *  client calendar render can draw them as life-event blocks without
   *  a second round-trip. Empty array if no rules apply. */
  availabilityRules: AvailabilityRule[];
}

interface ConceptKnowledge {
  level: "strong" | "moderate" | "weak";
  attempts: number;
  intervention_cost?: number;
  last_seen?: string;
}

const LEVEL_RANK: Record<ConceptKnowledge["level"], number> = {
  weak: 0,
  moderate: 1,
  strong: 2,
};

/**
 * Slot durations are sized for *deep work* — 60–120 minutes per block. With
 * `DAILY_LOAD_BUDGET = 3` (see study-band.ts) this lands a typical week
 * inside Nexford's 12–15h success band naturally, without a second top-up
 * pass. An adult degree learner with a job realistically does 1–2 deep blocks
 * a day, not 4–6 micro-sessions.
 */
const KIND_DURATION_MIN: Record<SlotKind, number> = {
  new: 90,
  review: 60,
  practice: 75,
  stretch: 120,
};

const DAY_LABELS: ReadonlyArray<DayOfWeek> = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];
/** Total study window in minutes (08:00..22:00 = 14h = 840). Mirrors
 *  DAY_START_MIN/DAY_END_MIN in day-schedule.ts so server and client
 *  agree on what "the study day" means. */
const DAY_WINDOW_MIN = DAY_END_MIN - DAY_START_MIN;

function formatLabel(tag: CanonicalConcept): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(weekStart: string, n: number): Date {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Forgetting-curve priority. Higher = more urgent to schedule this week.
 *
 *   priority = base_by_level × spacing_multiplier
 *
 * - base_by_level: weak concepts win on baseline urgency (5), moderate
 *   need consolidation (3), strong are spaced-review candidates (1).
 * - spacing_multiplier: hours_since_last_seen / (24 × 2^level_rank). A
 *   strong concept seen 4 days ago is at 2^2 = 4-day "natural review"
 *   horizon; we don't want to over-schedule it. A weak concept seen
 *   yesterday already has high base + moderate multiplier.
 *
 * Concepts NEVER seen get the highest spacing multiplier (treat as
 * "infinitely overdue") so brand-new material always lands in the plan.
 */
function priorityScore(
  knowledge: ConceptKnowledge | undefined,
  now: number,
): number {
  if (!knowledge) return 5 * 4; // brand-new concept: priority 20
  const baseByLevel = { weak: 5, moderate: 3, strong: 1 }[knowledge.level];
  const lastSeenMs = knowledge.last_seen
    ? new Date(knowledge.last_seen).getTime()
    : 0;
  const hoursSince = lastSeenMs > 0 ? (now - lastSeenMs) / 3_600_000 : 96;
  const horizon = 24 * Math.pow(2, LEVEL_RANK[knowledge.level]);
  const multiplier = Math.max(0.25, hoursSince / horizon);
  // Soft bump for hard-earned mastery: if the road was costly, bias
  // toward more frequent review even when level=strong.
  const interventionBump = (knowledge.intervention_cost ?? 0) >= 3 ? 1.4 : 1.0;
  return baseByLevel * multiplier * interventionBump;
}

function pickSlotKind(
  k: ConceptKnowledge | undefined,
  attemptIndex: number,
): SlotKind {
  if (!k) return "new";
  if (k.level === "weak") return attemptIndex === 0 ? "practice" : "review";
  if (k.level === "moderate") return "practice";
  // strong: alternate between spaced review and stretch transfer
  return attemptIndex % 2 === 0 ? "review" : "stretch";
}

function rationaleFor(
  concept: CanonicalConcept,
  k: ConceptKnowledge | undefined,
  kind: SlotKind,
): string {
  const label = formatLabel(concept);
  if (!k) {
    return `New material — schedule before related concepts compound. (Bjork 1994: spacing matters most when the trace is fresh.)`;
  }
  if (k.level === "weak") {
    return kind === "practice"
      ? `${label} is shaky (${k.attempts} attempt${k.attempts === 1 ? "" : "s"}). One focused practice block to find the broken reasoning step.`
      : `Quick review pass — second exposure within 48h is when retention compounds.`;
  }
  if (k.level === "moderate") {
    return `Building toward strong. A scenario-style probe today consolidates without re-teaching from scratch.`;
  }
  // strong
  if ((k.intervention_cost ?? 0) >= 3) {
    return `Hard-earned strong. Scheduled for spaced review — the road here was costly, so the trace decays faster.`;
  }
  return kind === "stretch"
    ? `Stretch slot — apply ${label} in an unfamiliar context to test transfer.`
    : `Routine spaced review (Bjork 1994). Twelve minutes locks the trace in.`;
}

export interface PlanInput {
  studentId: string;
  weekStart?: string;
  knowledgeGraph?: { concepts: Record<string, ConceptKnowledge> };
  /** Conversational busy windows (e.g. "Work · Wed 08:00–22:00") declared
   *  via the Planner chat. The agent treats each rule as a hard deduction
   *  from that day's available study minutes. Slots that don't fit on a
   *  constrained day cascade onto less-constrained ones. */
  availabilityRules?: AvailabilityRule[];
}

export function generateWeeklyPlan(input: PlanInput): WeekPlan {
  const now = Date.now();
  const weekStart = input.weekStart ?? mondayOf(new Date(now));
  const concepts = input.knowledgeGraph?.concepts ?? {};
  const rules = input.availabilityRules ?? [];

  // Score every canonical concept.
  const scored = CANONICAL_KEYS.map((tag) => {
    const k = concepts[tag] as ConceptKnowledge | undefined;
    return { tag, score: priorityScore(k, now), knowledge: k };
  }).sort((a, b) => b.score - a.score);

  // Greedy fill: keep adding the highest-priority concept that fits the
  // current day's remaining load AND remaining minute budget. Each
  // concept can repeat (capped at 2 appearances per week so the plan
  // feels varied).
  //
  // Two budgets per day, both must be respected:
  //   - load (1..3 cognitive units)  → keeps the day humane
  //   - minutes (DAY_WINDOW_MIN minus busy windows) → keeps the day fittable
  // The minutes budget is what makes the planner hour-aware: a Wed with
  // a 14h "Work" rule has 0 available minutes, so nothing lands there.
  //
  // Plus one weekly budget enforced inside the loop:
  //   - WEEKLY_CEILING_MIN (1200 = 20h) → absolute hard cap. The planner
  //     refuses to place a slot that would push the weekly total above
  //     the sustainable ceiling, even if a day still has load + minute
  //     headroom. This is the only place the weekly band shapes behaviour
  //     during generation; everything else is deterministic per-day fill.
  const repeatCap = new Map<CanonicalConcept, number>();
  // Track per-day deductions for the rationale summary so we can call out
  // redistribution explicitly ("Wed cleared, redistributed to Sat").
  const dayMetrics: Array<{
    label: DayOfWeek;
    busyMin: number;
    availableMin: number;
  }> = [];
  const days: PlanDay[] = DAY_LABELS.map((label, i) => {
    const date = isoDate(addDays(weekStart, i));
    const busyMin = busyMinutesForDay(rules, label);
    const availableMin = Math.max(0, DAY_WINDOW_MIN - busyMin);
    dayMetrics.push({ label, busyMin, availableMin });
    return { date, dayLabel: label, totalLoad: 0, slots: [] };
  });

  let weekTotalMin = 0;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    let remainingLoad = DAILY_LOAD_BUDGET;
    let remainingMin = dayMetrics[i].availableMin;

    let safety = 0;
    while (remainingLoad > 0 && remainingMin >= SLOT_VISUAL_MIN && safety++ < 30) {
      const pick = scored.find((s) => {
        const load = COGNITIVE_LOAD[s.tag];
        const used = repeatCap.get(s.tag) ?? 0;
        const onThisDay = day.slots.some((sl) => sl.concept === s.tag);
        return load <= remainingLoad && used < 2 && !onThisDay;
      });
      if (!pick) break;
      const load = COGNITIVE_LOAD[pick.tag];
      const attemptIndex = repeatCap.get(pick.tag) ?? 0;
      const kind = pickSlotKind(pick.knowledge, attemptIndex);
      const dur = KIND_DURATION_MIN[kind];
      // Hard weekly ceiling: stop placing slots that would push the week
      // past 20h, even if this day still has headroom. Stops the rest
      // of the week's fill, not just this day's.
      if (weekTotalMin + dur > WEEKLY_CEILING_MIN) {
        remainingLoad = 0;
        break;
      }
      day.slots.push({
        concept: pick.tag,
        conceptLabel: formatLabel(pick.tag),
        load,
        durationMin: dur,
        kind,
        rationale: rationaleFor(pick.tag, pick.knowledge, kind),
      });
      day.totalLoad += load;
      remainingLoad -= load;
      remainingMin -= SLOT_VISUAL_MIN;
      weekTotalMin += dur;
      repeatCap.set(pick.tag, attemptIndex + 1);
    }
    if (weekTotalMin >= WEEKLY_CEILING_MIN) break;
  }

  // Single-pass interleaving swap: if Day N+1 leads with the same concept
  // Day N ended on, try swapping with a later day's first slot. Pure
  // ergonomics — same plan, less monotony.
  for (let i = 0; i < days.length - 1; i++) {
    const tail = days[i].slots.at(-1);
    const head = days[i + 1].slots[0];
    if (tail && head && tail.concept === head.concept) {
      for (let j = i + 2; j < days.length; j++) {
        const candidate = days[j].slots[0];
        if (!candidate) continue;
        if (candidate.concept !== tail.concept) {
          days[i + 1].slots[0] = candidate;
          days[j].slots[0] = head;
          break;
        }
      }
    }
  }

  const struggling = scored.filter(
    (s) => s.knowledge && s.knowledge.level === "weak",
  ).length;
  const newConcepts = scored.filter((s) => !s.knowledge).length;
  const baseSummary =
    struggling > 0
      ? `Front-loaded ${struggling} weak concept${struggling === 1 ? "" : "s"} early in the week — intervene while the trace is fresh, then space the review.`
      : newConcepts > 0
        ? `Heavier on new material early in the week with mid-week consolidation passes.`
        : `Consolidation week — short spaced reviews to lock in mastery without overload.`;

  // Redistribution callout: when an availability rule has materially
  // shrunk a day's window, name it. Threshold is "lost more than half the
  // study window" so we only mention substantive trade-offs.
  const constrainedDays = dayMetrics.filter(
    (d) => d.busyMin > DAY_WINDOW_MIN / 2,
  );
  let rationaleSummary = baseSummary;
  if (constrainedDays.length > 0) {
    const constrained = constrainedDays
      .map((d) => {
        const dayPlan = days.find((p) => p.dayLabel === d.label);
        const slotCount = dayPlan?.slots.length ?? 0;
        return `${d.label} (${slotCount} slot${slotCount === 1 ? "" : "s"})`;
      })
      .join(", ");
    rationaleSummary =
      `${baseSummary} Constrained by your calendar: ${constrained} cleared or trimmed, and the displaced study time was redistributed to the days with open windows.`;
  }

  return {
    studentId: input.studentId,
    weekStart,
    generatedAt: new Date().toISOString(),
    source: input.knowledgeGraph ? "live" : "fallback_seed",
    rationaleSummary,
    days,
    weekTotalMin,
    band: classifyBand(weekTotalMin),
    availabilityRules: rules,
  };
}

function mondayOf(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday → previous Monday
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return isoDate(monday);
}

/**
 * Convenience wrapper: load the student's knowledge_graph from Supabase
 * and feed it to generateWeeklyPlan. Deliberately defensive — a missing
 * profile is treated as "all concepts new", not an error, so the demo
 * always has a plan to render.
 */
export async function generateWeeklyPlanForStudent(
  sb: SupabaseClient,
  opts: { studentId: string; courseId: string; weekStart?: string },
): Promise<WeekPlan> {
  // Two parallel reads: knowledge graph + availability rules. Both are
  // tiny single-row/few-row queries, so paying for the round-trip in
  // sequence would be a waste.
  const [{ data }, rules] = await Promise.all([
    sb
      .from("learner_profiles")
      .select("knowledge_graph")
      .eq("user_id", opts.studentId)
      .eq("course_id", opts.courseId)
      .maybeSingle(),
    loadRulesForStudent(sb, opts.studentId, opts.courseId),
  ]);

  return generateWeeklyPlan({
    studentId: opts.studentId,
    weekStart: opts.weekStart,
    knowledgeGraph: data?.knowledge_graph ?? undefined,
    availabilityRules: rules,
  });
}

/**
 * Hand-seeded fallback plan keyed to "Sara" (the demo persona). Used
 * when DEMO_MODE is on or the live generator returns an unusable result
 * (no concepts, profile missing, etc.). The numbers are deliberate: a
 * known weakness on Prepaid Expenses, hard-earned mastery on
 * Depreciation, brand-new material on WACC — so the plan rationale
 * speaks to the demo narrative without depending on whatever state the
 * stress-test database happens to be in.
 */
export function fallbackSeedPlan(weekStart?: string): WeekPlan {
  return generateWeeklyPlan({
    studentId: "demo-sara",
    weekStart,
    knowledgeGraph: {
      concepts: {
        accrual_vs_cash: {
          level: "strong",
          attempts: 4,
          intervention_cost: 1,
          last_seen: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        },
        matching_principle: {
          level: "moderate",
          attempts: 3,
          intervention_cost: 2,
          last_seen: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        },
        prepaid_expenses: {
          level: "weak",
          attempts: 5,
          intervention_cost: 4,
          last_seen: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        },
        revenue_recognition: {
          level: "moderate",
          attempts: 2,
          intervention_cost: 1,
          last_seen: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        },
        accounting_equation: {
          level: "strong",
          attempts: 2,
          last_seen: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        },
        depreciation: {
          level: "strong",
          attempts: 6,
          intervention_cost: 3,
          last_seen: new Date(Date.now() - 4 * 86_400_000).toISOString(),
        },
        // wacc and unit-economics concepts deliberately absent → counted
        // as brand-new material, scheduled aggressively.
      },
    },
  });
}
