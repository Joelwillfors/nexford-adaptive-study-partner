/**
 * Availability rules — server-side access layer over `availability_rules`.
 *
 * One source of truth, two consumers:
 *   1. The deterministic planner-agent (`planner-agent.ts`) reads these
 *      rules to compute per-day available minutes — slots that don't fit
 *      the remaining budget on a constrained day get redistributed.
 *   2. The visual layer (`day-schedule.ts` via `rulesAsLifeEvents`)
 *      renders them as life-event blocks on the calendar grid.
 *
 * The chat tools `set_availability_rule` / `clear_availability_rule`
 * call `addRule` / `removeRuleByLabel` here AND then re-run the planner
 * so the user sees the redistribution in the same chat turn.
 *
 * Idempotency: `addRule` upserts on the recurring-rule unique index
 * `(user_id, course_id, label, day_of_week, start_min, end_min)` from
 * migration 005, so re-asserting the same rule is a no-op rather than
 * a duplicate row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DayOfWeek,
  LifeEvent,
  LifeEventKind,
} from "@/lib/planner/life-events";

export type AvailabilityRuleKind = "busy_recurring" | "busy_one_off";

export interface AvailabilityRule {
  id: string;
  userId: string;
  courseId: string;
  label: string;
  kind: AvailabilityRuleKind;
  dayOfWeek: DayOfWeek | null;
  date: string | null;
  startMin: number;
  endMin: number;
  source: string;
  createdAt: string;
}

export interface AddRuleInput {
  userId: string;
  courseId: string;
  label: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  source?: string;
}

interface RuleRow {
  id: string;
  user_id: string;
  course_id: string;
  label: string;
  kind: AvailabilityRuleKind;
  day_of_week: DayOfWeek | null;
  date: string | null;
  start_min: number;
  end_min: number;
  source: string;
  created_at: string;
}

function rowToRule(r: RuleRow): AvailabilityRule {
  return {
    id: r.id,
    userId: r.user_id,
    courseId: r.course_id,
    label: r.label,
    kind: r.kind,
    dayOfWeek: r.day_of_week,
    date: r.date,
    startMin: r.start_min,
    endMin: r.end_min,
    source: r.source,
    createdAt: r.created_at,
  };
}

export async function loadRulesForStudent(
  sb: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<AvailabilityRule[]> {
  const { data, error } = await sb
    .from("availability_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });
  if (error) {
    // Non-fatal: an absent table (older env) or transient read error
    // shouldn't break the planner. The deterministic plan just runs
    // without rules.
    console.warn("[availability-rules] load failed:", error.message);
    return [];
  }
  return ((data ?? []) as RuleRow[]).map(rowToRule);
}

export async function addRule(
  sb: SupabaseClient,
  input: AddRuleInput,
): Promise<AvailabilityRule> {
  if (input.endMin <= input.startMin) {
    throw new Error(
      `Invalid availability window: ${input.startMin}..${input.endMin} (end must be > start)`,
    );
  }
  if (input.startMin < 0 || input.endMin > 1440) {
    throw new Error(
      `Availability window out of range (0..1440): ${input.startMin}..${input.endMin}`,
    );
  }

  // Idempotency via select-then-insert. We can't ON CONFLICT against the
  // partial unique index from migration 005 (Postgres rejects partial
  // indexes as conflict targets unless the predicate is restated), so we
  // do the lookup explicitly. Two roundtrips, but the table is tiny.
  const { data: existing } = await sb
    .from("availability_rules")
    .select("*")
    .eq("user_id", input.userId)
    .eq("course_id", input.courseId)
    .ilike("label", input.label)
    .eq("kind", "busy_recurring")
    .eq("day_of_week", input.dayOfWeek)
    .eq("start_min", input.startMin)
    .eq("end_min", input.endMin)
    .limit(1)
    .maybeSingle();
  if (existing) return rowToRule(existing as RuleRow);

  const { data, error } = await sb
    .from("availability_rules")
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      label: input.label,
      kind: "busy_recurring",
      day_of_week: input.dayOfWeek,
      start_min: input.startMin,
      end_min: input.endMin,
      source: input.source ?? "chat",
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Insert failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRule(data as RuleRow);
}

export async function removeRuleByLabel(
  sb: SupabaseClient,
  userId: string,
  courseId: string,
  label: string,
): Promise<number> {
  const { data, error } = await sb
    .from("availability_rules")
    .delete()
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .ilike("label", label)
    .select("id");
  if (error) throw new Error(`Delete failed: ${error.message}`);
  return (data ?? []).length;
}

/** Pretty "08:00 - 22:00" formatter mirroring `parseLifeEventWindow`. */
function formatWindow(startMin: number, endMin: number): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  };
  return `${fmt(startMin)} - ${fmt(endMin)}`;
}

const KEYWORD_TO_KIND: Array<[RegExp, LifeEventKind]> = [
  [/work|job|shift|office/i, "work"],
  [/gym|workout|run|yoga|swim|train|fitness|soccer|football|basketball|sport/i, "fitness"],
  [/lecture|class|seminar|study|tutor|recital/i, "lecture"],
  [/family|dinner|brunch|date|friends|party|wedding|funeral|church/i, "social"],
];

function inferKindFromLabel(label: string): LifeEventKind {
  for (const [re, kind] of KEYWORD_TO_KIND) {
    if (re.test(label)) return kind;
  }
  return "work";
}

/**
 * Adapter: turn persisted rules into the existing `LifeEvent` shape so
 * `day-schedule.ts > eventsForDay()` consumers can merge rule-driven
 * busy windows with hardcoded ones without a second code path.
 *
 * Filters by the day label so only the relevant rules show up. Pass
 * `null` to pull every rule (useful for chat status messages).
 */
export function rulesAsLifeEvents(
  rules: AvailabilityRule[],
  dayLabel: DayOfWeek | null,
): LifeEvent[] {
  return rules
    .filter((r) => r.kind === "busy_recurring")
    .filter((r) => (dayLabel === null ? true : r.dayOfWeek === dayLabel))
    .map((r) => ({
      label: r.label,
      time: formatWindow(r.startMin, r.endMin),
      kind: inferKindFromLabel(r.label),
      source: "rule" as const,
    }));
}

/** Sum of busy minutes for a given dayLabel — used by the planner-agent
 *  to compute per-day available study minutes. */
export function busyMinutesForDay(
  rules: AvailabilityRule[],
  dayLabel: DayOfWeek,
): number {
  let sum = 0;
  for (const r of rules) {
    if (r.kind !== "busy_recurring") continue;
    if (r.dayOfWeek !== dayLabel) continue;
    sum += r.endMin - r.startMin;
  }
  return sum;
}

/** Parse "HH:MM" → minutes since midnight, with friendly error. */
export function parseHHMM(s: string): number {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid time '${s}'. Expected HH:MM (24-hour).`);
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) {
    throw new Error(`Time '${s}' out of range.`);
  }
  return h * 60 + mm;
}

const DAY_NAMES: ReadonlyArray<DayOfWeek> = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export function isDayOfWeek(s: string): s is DayOfWeek {
  return (DAY_NAMES as ReadonlyArray<string>).includes(s);
}
