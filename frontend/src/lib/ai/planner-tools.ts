/**
 * Planner Tool Registry — the function-calling layer the LLM sees when
 * the student asks the Planner Assistant to rearrange the week.
 *
 * Three tools, each a pure function over a WeekPlan:
 *   - move_slot:        relocate one concept's session from one day to another
 *   - trim_day:         drop the lowest-priority slots until totalDuration ≤ maxMinutes
 *   - add_remediation:  inject a 10-min Review slot for a struggling concept
 *
 * Why the executor is separate from the LLM client:
 *   - Same code path runs in DEMO_MODE (deterministic chip → tool-call sequence)
 *     and in live mode (OpenAI tool-use loop). Removes one whole class of
 *     "the LLM did one thing, the demo fixture did another" drift.
 *   - The executor is testable without touching OpenAI at all.
 *
 * The mutation contract is "input is not mutated" — every executor returns
 * a fresh deep clone via structuredClone. This is what lets the API route
 * apply N tool calls in sequence without surprising the caller.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanSlot, WeekPlan } from "@/lib/planner/types";
import { CANONICAL_KEYS, type CanonicalConcept } from "@/lib/ai/concept-canon";
import {
  addRule,
  busyMinutesForDay,
  isDayOfWeek,
  parseHHMM,
  removeRuleByLabel,
  type AvailabilityRule,
} from "@/lib/calendar/availability-rules";
import { generateWeeklyPlanForStudent } from "@/lib/ai/planner-agent";
import { DAILY_LOAD_BUDGET, classifyBand } from "@/lib/planner/study-band";

export type DayLabel = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAY_LABELS: readonly DayLabel[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export type ToolName =
  | "move_slot"
  | "trim_day"
  | "add_remediation"
  | "set_availability_rule"
  | "clear_availability_rule";

/** Context passed to executors that have side-effects beyond the plan
 *  (i.e. the availability-rule tools, which write to Postgres and then
 *  re-run the deterministic planner so the chat turn returns a plan
 *  that already reflects the new constraint). Sync tools ignore it. */
export interface ToolContext {
  /** Supabase service client. Undefined in DEMO_MODE; the rule executors
   *  fall back to in-memory mutation of plan.availabilityRules so the
   *  demo still shows the redistribution. */
  sb?: SupabaseClient;
  studentId: string;
  courseId: string;
  weekStart?: string;
}

export interface ToolCall<TArgs = Record<string, unknown>> {
  name: ToolName;
  args: TArgs;
  result: ToolResult;
}

export interface ToolResult {
  status: "ok" | "noop" | "error";
  message: string;
}

// ── OpenAI tool-schema definitions ──────────────────────────────────────────
//
// These are the `tools` array passed to the chat completion. The
// `description` strings are the only documentation the LLM gets, so they
// are written for the model, not for humans reading the code: short,
// imperative, scoped to one job each.

export const PLANNER_TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "move_slot" as ToolName,
      description:
        "Move a single study slot identified by its concept tag from one day of the week to another. Use when the student wants ONE specific session relocated. If the same concept appears on multiple days, only the slot on `fromDay` is moved.",
      parameters: {
        type: "object",
        properties: {
          concept: {
            type: "string",
            description:
              "Canonical concept tag of the slot to move (snake_case, e.g. 'depreciation', 'accrual_vs_cash', 'matching_principle').",
          },
          fromDay: { type: "string", enum: [...DAY_LABELS] },
          toDay: { type: "string", enum: [...DAY_LABELS] },
        },
        required: ["concept", "fromDay", "toDay"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "trim_day" as ToolName,
      description:
        "Cap the total study time on a given day to `maxMinutes`. Drops slots from the END of the day until the remaining duration fits. Use when the student says 'I only have N minutes today' or similar. The dropped slots are NOT lost — they will be re-suggested by the next plan generation.",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", enum: [...DAY_LABELS] },
          maxMinutes: { type: "number", minimum: 0 },
        },
        required: ["day", "maxMinutes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_remediation" as ToolName,
      description:
        "Inject a 10-minute Review slot for a concept the student is struggling with on a chosen day. This is the SAME tool the Profiler will eventually invoke automatically when a concept fails 3 times in the Mentor — for v1 the student or teacher can call it manually. Refuses if the day is already at its 3-unit cognitive-load budget.",
      parameters: {
        type: "object",
        properties: {
          concept: {
            type: "string",
            description: "Canonical concept tag (snake_case).",
          },
          day: { type: "string", enum: [...DAY_LABELS] },
        },
        required: ["concept", "day"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_availability_rule" as ToolName,
      description:
        "Persist a recurring busy window in the student's calendar. Use whenever the student mentions a regular life commitment (work, classes outside this course, sport, family). Future weekly plans will respect it: study slots will not be scheduled in this window, and the current plan is regenerated immediately so the change is visible in the same turn. Always pass times in 24-hour HH:MM format, e.g. '08:00' / '13:30' / '22:00'.",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description:
              "Short human-readable label, e.g. 'Work', 'Soccer', 'Marketing 101 lecture'. Used both for display and as the dedupe key.",
          },
          dayOfWeek: { type: "string", enum: [...DAY_LABELS] },
          startTime: {
            type: "string",
            description: "24-hour HH:MM, e.g. '08:00'.",
          },
          endTime: {
            type: "string",
            description: "24-hour HH:MM, strictly later than startTime.",
          },
        },
        required: ["label", "dayOfWeek", "startTime", "endTime"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_availability_rule" as ToolName,
      description:
        "Remove a previously stored availability rule by its label. Case-insensitive. Use when the student says something like 'I quit my job' or 'I dropped soccer'. Triggers a plan regeneration to reclaim the freed-up windows.",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description:
              "Label to match. Removes ALL rules with this label across all days.",
          },
        },
        required: ["label"],
        additionalProperties: false,
      },
    },
  },
];

// ── Executors ───────────────────────────────────────────────────────────────

interface MoveSlotArgs {
  concept: string;
  fromDay: DayLabel;
  toDay: DayLabel;
}

export function executeMoveSlot(
  plan: WeekPlan,
  args: MoveSlotArgs,
): { plan: WeekPlan; result: ToolResult } {
  if (!DAY_LABELS.includes(args.fromDay) || !DAY_LABELS.includes(args.toDay)) {
    return {
      plan,
      result: { status: "error", message: `Invalid day label.` },
    };
  }
  if (args.fromDay === args.toDay) {
    return {
      plan,
      result: {
        status: "noop",
        message: `Source and target day are the same (${args.fromDay}).`,
      },
    };
  }
  const next = structuredClone(plan);
  const fromIdx = next.days.findIndex((d) => d.dayLabel === args.fromDay);
  const toIdx = next.days.findIndex((d) => d.dayLabel === args.toDay);
  if (fromIdx === -1 || toIdx === -1) {
    return {
      plan,
      result: {
        status: "error",
        message: `Day not found in current week (${args.fromDay} → ${args.toDay}).`,
      },
    };
  }
  const slotIdx = next.days[fromIdx].slots.findIndex(
    (s) => s.concept === args.concept,
  );
  if (slotIdx === -1) {
    return {
      plan,
      result: {
        status: "noop",
        message: `No slot for "${args.concept}" found on ${args.fromDay}.`,
      },
    };
  }
  const [slot] = next.days[fromIdx].slots.splice(slotIdx, 1);
  next.days[fromIdx].totalLoad -= slot.load;
  next.days[toIdx].slots.unshift(slot);
  next.days[toIdx].totalLoad += slot.load;
  return {
    plan: next,
    result: {
      status: "ok",
      message: `Moved ${slot.conceptLabel} from ${args.fromDay} to ${args.toDay}.`,
    },
  };
}

interface TrimDayArgs {
  day: DayLabel;
  maxMinutes: number;
}

export function executeTrimDay(
  plan: WeekPlan,
  args: TrimDayArgs,
): { plan: WeekPlan; result: ToolResult } {
  if (!DAY_LABELS.includes(args.day)) {
    return {
      plan,
      result: { status: "error", message: `Invalid day label "${args.day}".` },
    };
  }
  if (!Number.isFinite(args.maxMinutes) || args.maxMinutes < 0) {
    return {
      plan,
      result: { status: "error", message: `maxMinutes must be ≥ 0.` },
    };
  }
  const next = structuredClone(plan);
  const dayIdx = next.days.findIndex((d) => d.dayLabel === args.day);
  if (dayIdx === -1) {
    return {
      plan,
      result: {
        status: "error",
        message: `Day "${args.day}" not in this week.`,
      },
    };
  }
  const day = next.days[dayIdx];
  if (day.slots.length === 0) {
    return {
      plan,
      result: {
        status: "noop",
        message: `${args.day} is already a rest day.`,
      },
    };
  }
  let cumulative = 0;
  const kept: PlanSlot[] = [];
  for (const slot of day.slots) {
    if (cumulative + slot.durationMin <= args.maxMinutes) {
      kept.push(slot);
      cumulative += slot.durationMin;
    }
  }
  const dropped = day.slots.length - kept.length;
  day.slots = kept;
  day.totalLoad = kept.reduce((a, s) => a + s.load, 0);
  if (dropped === 0) {
    return {
      plan: next,
      result: {
        status: "noop",
        message: `${args.day} already fits within ${args.maxMinutes} min.`,
      },
    };
  }
  return {
    plan: next,
    result: {
      status: "ok",
      message: `Trimmed ${args.day} to ${cumulative} min (${kept.length} slots kept, ${dropped} dropped).`,
    },
  };
}

interface AddRemediationArgs {
  concept: string;
  day: DayLabel;
}

export function executeAddRemediation(
  plan: WeekPlan,
  args: AddRemediationArgs,
): { plan: WeekPlan; result: ToolResult } {
  if (!DAY_LABELS.includes(args.day)) {
    return {
      plan,
      result: { status: "error", message: `Invalid day label.` },
    };
  }
  const conceptKey = args.concept as CanonicalConcept;
  const isCanonical = (CANONICAL_KEYS as readonly string[]).includes(
    args.concept,
  );
  const conceptLabel = isCanonical
    ? labelFor(conceptKey)
    : args.concept.replace(/_/g, " ");

  const next = structuredClone(plan);
  const dayIdx = next.days.findIndex((d) => d.dayLabel === args.day);
  if (dayIdx === -1) {
    return {
      plan,
      result: {
        status: "error",
        message: `Day "${args.day}" not in this week.`,
      },
    };
  }
  const day = next.days[dayIdx];
  const newLoad: 1 | 2 | 3 = 1;
  if (day.totalLoad + newLoad > DAILY_LOAD_BUDGET) {
    return {
      plan,
      result: {
        status: "noop",
        message: `${args.day} is at capacity (${day.totalLoad}/${DAILY_LOAD_BUDGET}) — pick a lighter day.`,
      },
    };
  }
  day.slots.push({
    concept: args.concept,
    conceptLabel,
    load: newLoad,
    durationMin: 10,
    kind: "review",
    rationale: `Remediation slot — Socrates flagged ${conceptLabel} as a concept worth a quick refresher.`,
  });
  day.totalLoad += newLoad;
  return {
    plan: next,
    result: {
      status: "ok",
      message: `Added a 10-min ${conceptLabel} review on ${args.day}.`,
    },
  };
}

function labelFor(concept: CanonicalConcept): string {
  return concept
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

interface SetAvailabilityArgs {
  label: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

/**
 * Persist a "busy" window AND regenerate the week so the student sees
 * the redistribution in the same chat turn.
 *
 * Two paths:
 *   - Live (ctx.sb is set): write to availability_rules, then re-read the
 *     plan via generateWeeklyPlanForStudent (which now reloads rules).
 *   - Demo (no sb): mutate `plan.availabilityRules` in-memory and let the
 *     deterministic planner-agent run on the cloned plan. The demo can't
 *     persist, but the redistribution is still visible.
 */
async function executeSetAvailabilityRule(
  plan: WeekPlan,
  args: SetAvailabilityArgs,
  ctx: ToolContext,
): Promise<{ plan: WeekPlan; result: ToolResult }> {
  if (!isDayOfWeek(args.dayOfWeek)) {
    return {
      plan,
      result: {
        status: "error",
        message: `Invalid dayOfWeek "${args.dayOfWeek}". Use one of ${DAY_LABELS.join(", ")}.`,
      },
    };
  }
  let startMin: number;
  let endMin: number;
  try {
    startMin = parseHHMM(args.startTime);
    endMin = parseHHMM(args.endTime);
  } catch (e) {
    return {
      plan,
      result: {
        status: "error",
        message: e instanceof Error ? e.message : "Invalid time format.",
      },
    };
  }
  if (endMin <= startMin) {
    return {
      plan,
      result: {
        status: "error",
        message: `endTime (${args.endTime}) must be later than startTime (${args.startTime}).`,
      },
    };
  }

  if (!ctx.sb) {
    // Demo path: no DB, no full planner re-run. We approximate the live
    // behaviour by appending the rule to the in-memory list AND, if the
    // new rule consumes a meaningful chunk of the day, redistributing
    // existing study slots off that day onto the lightest other day.
    // Good enough for the demo to *visibly* react; the live path does
    // the real, deterministic version.
    const cloned = structuredClone(plan);
    const existing = cloned.availabilityRules ?? [];
    const dup = existing.some(
      (r) =>
        r.label.toLowerCase() === args.label.toLowerCase() &&
        r.dayOfWeek === args.dayOfWeek &&
        r.startMin === startMin &&
        r.endMin === endMin,
    );
    if (!dup) {
      existing.push({
        id: `demo-${Date.now()}`,
        userId: ctx.studentId,
        courseId: ctx.courseId,
        label: args.label,
        kind: "busy_recurring",
        dayOfWeek: args.dayOfWeek,
        date: null,
        startMin,
        endMin,
        source: "chat",
        createdAt: new Date().toISOString(),
      });
    }
    cloned.availabilityRules = existing;
    const before = countSlotsForDay(cloned, args.dayOfWeek);
    const ruleSpansFullDay = endMin - startMin >= 8 * 60;
    let movedTo: string | null = null;
    if (ruleSpansFullDay && before > 0) {
      const targetDay = lightestOtherDay(cloned, args.dayOfWeek);
      if (targetDay) {
        const constrained = cloned.days.find(
          (d) => d.dayLabel === args.dayOfWeek,
        );
        const target = cloned.days.find((d) => d.dayLabel === targetDay);
        if (constrained && target) {
          for (const slot of constrained.slots) {
            target.slots.push(slot);
            target.totalLoad += slot.load;
          }
          constrained.slots = [];
          constrained.totalLoad = 0;
          movedTo = targetDay;
        }
      }
    }
    const after = countSlotsForDay(cloned, args.dayOfWeek);
    return {
      plan: cloned,
      result: {
        status: "ok",
        message:
          movedTo !== null
            ? `Added "${args.label}" on ${args.dayOfWeek} ${args.startTime}–${args.endTime}. ${args.dayOfWeek} cleared (${before} slot${before === 1 ? "" : "s"} redistributed to ${movedTo}).`
            : `Added "${args.label}" on ${args.dayOfWeek} ${args.startTime}–${args.endTime}. ${args.dayOfWeek} now has ${after} slot${after === 1 ? "" : "s"}.`,
      },
    };
  }

  try {
    await addRule(ctx.sb, {
      userId: ctx.studentId,
      courseId: ctx.courseId,
      label: args.label,
      dayOfWeek: args.dayOfWeek,
      startMin,
      endMin,
    });
  } catch (e) {
    return {
      plan,
      result: {
        status: "error",
        message: e instanceof Error ? e.message : "Insert failed.",
      },
    };
  }
  // Regenerate so the returned plan reflects the new constraint.
  const regenerated = await generateWeeklyPlanForStudent(ctx.sb, {
    studentId: ctx.studentId,
    courseId: ctx.courseId,
    weekStart: ctx.weekStart ?? plan.weekStart,
  });
  const before = countSlotsForDay(plan, args.dayOfWeek);
  const after = countSlotsForDay(regenerated, args.dayOfWeek);
  const drop = before - after;
  const busyMin = busyMinutesForDay(
    regenerated.availabilityRules,
    args.dayOfWeek,
  );
  return {
    plan: regenerated,
    result: {
      status: "ok",
      message: `Added rule "${args.label}" (${args.dayOfWeek} ${args.startTime}–${args.endTime}, ${busyMin} min/week busy). ${args.dayOfWeek} dropped from ${before} to ${after} slot${after === 1 ? "" : "s"}${drop > 0 ? " (redistributed)" : ""}.`,
    },
  };
}

interface ClearAvailabilityArgs {
  label: string;
}

async function executeClearAvailabilityRule(
  plan: WeekPlan,
  args: ClearAvailabilityArgs,
  ctx: ToolContext,
): Promise<{ plan: WeekPlan; result: ToolResult }> {
  if (!args.label || args.label.trim().length === 0) {
    return {
      plan,
      result: { status: "error", message: "label is required." },
    };
  }

  if (!ctx.sb) {
    const cloned = structuredClone(plan);
    const before = (cloned.availabilityRules ?? []).length;
    cloned.availabilityRules = (cloned.availabilityRules ?? []).filter(
      (r) => r.label.toLowerCase() !== args.label.toLowerCase(),
    );
    const removed = before - cloned.availabilityRules.length;
    if (removed === 0) {
      return {
        plan,
        result: {
          status: "noop",
          message: `No rule with label "${args.label}" to clear.`,
        },
      };
    }
    return {
      plan: cloned,
      result: {
        status: "ok",
        message: `Cleared ${removed} rule${removed === 1 ? "" : "s"} matching "${args.label}".`,
      },
    };
  }

  let removed = 0;
  try {
    removed = await removeRuleByLabel(
      ctx.sb,
      ctx.studentId,
      ctx.courseId,
      args.label,
    );
  } catch (e) {
    return {
      plan,
      result: {
        status: "error",
        message: e instanceof Error ? e.message : "Delete failed.",
      },
    };
  }
  if (removed === 0) {
    return {
      plan,
      result: {
        status: "noop",
        message: `No rule matched label "${args.label}".`,
      },
    };
  }
  const regenerated = await generateWeeklyPlanForStudent(ctx.sb, {
    studentId: ctx.studentId,
    courseId: ctx.courseId,
    weekStart: ctx.weekStart ?? plan.weekStart,
  });
  return {
    plan: regenerated,
    result: {
      status: "ok",
      message: `Cleared ${removed} rule${removed === 1 ? "" : "s"} matching "${args.label}". The freed-up windows have been refilled with study slots.`,
    },
  };
}

function countSlotsForDay(plan: WeekPlan, day: string): number {
  return plan.days.find((d) => d.dayLabel === day)?.slots.length ?? 0;
}

/**
 * Re-derive `weekTotalMin` + `band` from the current set of slots. Called
 * after every plan-mutating tool so Atlas's reply (and the UI's Success Tip)
 * always reflect the post-mutation week, not the pre-mutation one. Cheap
 * — it's a single sum over ≤ 21 slots.
 *
 * Mutates the passed plan in place AND returns it for ergonomic chaining.
 */
function recomputePlanTotals(plan: WeekPlan): WeekPlan {
  const total = plan.days.reduce(
    (acc, d) => acc + d.slots.reduce((a, s) => a + s.durationMin, 0),
    0,
  );
  plan.weekTotalMin = total;
  plan.band = classifyBand(total);
  return plan;
}

function lightestOtherDay(plan: WeekPlan, exclude: string): string | null {
  let best: { label: string; load: number } | null = null;
  for (const d of plan.days) {
    if (d.dayLabel === exclude) continue;
    if (!best || d.totalLoad < best.load) {
      best = { label: d.dayLabel, load: d.totalLoad };
    }
  }
  return best?.label ?? null;
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export interface ParsedToolCall {
  id: string;
  name: ToolName;
  rawArgs: string;
}

/**
 * Apply a tool call to the plan. Unknown tools are returned as errors so
 * the LLM can recover (rare, since the schemas constrain function names).
 *
 * Async because two of the five tools (set_availability_rule /
 * clear_availability_rule) write to Postgres and re-run the deterministic
 * planner. The other three are synchronous and just close over the
 * promise resolution.
 */
export async function applyToolCall(
  plan: WeekPlan,
  call: ParsedToolCall,
  ctx: ToolContext,
): Promise<{ plan: WeekPlan; toolCall: ToolCall }> {
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(call.rawArgs || "{}");
  } catch {
    return {
      plan,
      toolCall: {
        name: call.name,
        args: { raw: call.rawArgs },
        result: { status: "error", message: "Invalid JSON arguments." },
      },
    };
  }
  const args = parsedArgs as Record<string, unknown>;
  // Every successful mutation goes through `recomputePlanTotals` so the
  // weekTotalMin / band on the plan we return is always derived from the
  // current slot set — not stale from the previous tool call. The live
  // availability paths already get fresh totals via
  // `generateWeeklyPlanForStudent`, but the in-memory mutators (move/trim/
  // remediation, plus the demo-mode availability paths) need the explicit
  // recompute or Atlas's reply would announce yesterday's hours.
  switch (call.name) {
    case "move_slot": {
      const out = executeMoveSlot(plan, args as unknown as MoveSlotArgs);
      return {
        plan: recomputePlanTotals(out.plan),
        toolCall: { name: call.name, args, result: out.result },
      };
    }
    case "trim_day": {
      const out = executeTrimDay(plan, args as unknown as TrimDayArgs);
      return {
        plan: recomputePlanTotals(out.plan),
        toolCall: { name: call.name, args, result: out.result },
      };
    }
    case "add_remediation": {
      const out = executeAddRemediation(
        plan,
        args as unknown as AddRemediationArgs,
      );
      return {
        plan: recomputePlanTotals(out.plan),
        toolCall: { name: call.name, args, result: out.result },
      };
    }
    case "set_availability_rule": {
      const out = await executeSetAvailabilityRule(
        plan,
        args as unknown as SetAvailabilityArgs,
        ctx,
      );
      return {
        plan: recomputePlanTotals(out.plan),
        toolCall: { name: call.name, args, result: out.result },
      };
    }
    case "clear_availability_rule": {
      const out = await executeClearAvailabilityRule(
        plan,
        args as unknown as ClearAvailabilityArgs,
        ctx,
      );
      return {
        plan: recomputePlanTotals(out.plan),
        toolCall: { name: call.name, args, result: out.result },
      };
    }
    default:
      return {
        plan,
        toolCall: {
          name: call.name,
          args,
          result: { status: "error", message: `Unknown tool: ${call.name}` },
        },
      };
  }
}

/** Re-export so AvailabilityRule consumers (like client `/plan/page.tsx`)
 *  don't need a deeper import path when they're already pulling tool
 *  types from this module. */
export type { AvailabilityRule };

// ── Demo-mode preset responses ──────────────────────────────────────────────
//
// When NEXT_PUBLIC_DEMO_MODE=true (or live mode hits an LLM error) we
// match the user's message against three intent fingerprints and return a
// hand-authored tool-call sequence. The same applyToolCall path runs over
// the result, so the UI and reasoning panel are identical to the live
// version — only the "thinking" was deterministic.

interface DemoResponse {
  replyText: string;
  toolCalls: { name: ToolName; args: Record<string, unknown> }[];
}

export function matchDemoIntent(
  userMessage: string,
  plan: WeekPlan,
): DemoResponse | null {
  const text = userMessage.toLowerCase();

  // "I'm sick today, push everything to the weekend"
  if (
    /(sick|flu|under the weather|exhausted|burnt out|burned out)/.test(text) &&
    /(weekend|saturday|sunday|sat|sun)/.test(text)
  ) {
    const today = todayDayLabel(plan);
    const calls: { name: ToolName; args: Record<string, unknown> }[] = [];
    const todayDay = plan.days.find((d) => d.dayLabel === today);
    if (todayDay) {
      for (const slot of todayDay.slots) {
        calls.push({
          name: "move_slot",
          args: { concept: slot.concept, fromDay: today, toDay: "Sat" },
        });
      }
    }
    return {
      replyText: `Sorry to hear it. I moved everything from ${today} to Saturday so you can rest today and catch up at the weekend.`,
      toolCalls: calls,
    };
  }

  // "Move Tuesday to Wednesday"
  const moveMatch = text.match(/move\s+(\w+)\s+to\s+(\w+)/);
  if (moveMatch) {
    const from = normalizeDay(moveMatch[1]);
    const to = normalizeDay(moveMatch[2]);
    if (from && to && from !== to) {
      const fromDay = plan.days.find((d) => d.dayLabel === from);
      const calls: { name: ToolName; args: Record<string, unknown> }[] = [];
      if (fromDay) {
        for (const slot of fromDay.slots) {
          calls.push({
            name: "move_slot",
            args: { concept: slot.concept, fromDay: from, toDay: to },
          });
        }
      }
      return {
        replyText: `Done — ${fromDay?.slots.length ?? 0} slot(s) moved from ${from} to ${to}.`,
        toolCalls: calls,
      };
    }
  }

  // "I only have N min today"
  const timeMatch =
    text.match(/(?:only\s+)?have\s+(\d+)\s*min/) ||
    text.match(/(\d+)\s*min(?:utes)?\s+today/);
  if (timeMatch) {
    const minutes = Number.parseInt(timeMatch[1], 10);
    const today = todayDayLabel(plan);
    return {
      replyText: `Trimmed ${today} to fit in ${minutes} minutes — anything that didn't fit comes back tomorrow.`,
      toolCalls: [
        {
          name: "trim_day",
          args: { day: today, maxMinutes: minutes },
        },
      ],
    };
  }

  // "I work all day Wednesday" / "Soccer Tuesday at 13:00 to 14:30"
  const workMatch = text.match(
    /(?:i\s+)?work(?:s|ing)?\s+(?:all\s+day\s+)?(?:on\s+)?(\w+)/,
  );
  if (workMatch) {
    const day = normalizeDay(workMatch[1]);
    if (day) {
      return {
        replyText: `Got it — added Work on ${day} 08:00–22:00. I cleared ${day} and pushed those slots to your lightest day.`,
        toolCalls: [
          {
            name: "set_availability_rule",
            args: {
              label: "Work",
              dayOfWeek: day,
              startTime: "08:00",
              endTime: "22:00",
            },
          },
        ],
      };
    }
  }

  // "Soccer Tuesday at 13:00 to 14:30"
  const activityMatch = text.match(
    /(?:i\s+have\s+)?(\w+)\s+(?:on\s+)?(\w+)s?\s+(?:at\s+|from\s+)?(\d{1,2}(?::\d{2})?)\s*(?:to|-|until)\s*(\d{1,2}(?::\d{2})?)/,
  );
  if (activityMatch) {
    const label = activityMatch[1];
    const day = normalizeDay(activityMatch[2]);
    const start = padHHMM(activityMatch[3]);
    const end = padHHMM(activityMatch[4]);
    if (day && start && end) {
      return {
        replyText: `Added "${capitalize(label)}" on ${day} ${start}–${end} as a recurring busy window.`,
        toolCalls: [
          {
            name: "set_availability_rule",
            args: {
              label: capitalize(label),
              dayOfWeek: day,
              startTime: start,
              endTime: end,
            },
          },
        ],
      };
    }
  }

  // "Drop the Work rule" / "Clear Soccer"
  const clearMatch = text.match(
    /(?:drop|clear|remove|delete)\s+(?:the\s+)?(\w+)(?:\s+rule)?/,
  );
  if (clearMatch) {
    return {
      replyText: `Cleared the "${capitalize(clearMatch[1])}" rule.`,
      toolCalls: [
        {
          name: "clear_availability_rule",
          args: { label: capitalize(clearMatch[1]) },
        },
      ],
    };
  }

  // "Skip Friday"
  const skipMatch = text.match(/skip\s+(\w+)/);
  if (skipMatch) {
    const day = normalizeDay(skipMatch[1]);
    if (day) {
      const dayObj = plan.days.find((d) => d.dayLabel === day);
      const idx = plan.days.findIndex((d) => d.dayLabel === day);
      const targetDay =
        idx >= 0 && idx < plan.days.length - 1
          ? plan.days[idx + 1].dayLabel
          : day;
      const calls: { name: ToolName; args: Record<string, unknown> }[] = [];
      if (dayObj) {
        for (const slot of dayObj.slots) {
          calls.push({
            name: "move_slot",
            args: {
              concept: slot.concept,
              fromDay: day,
              toDay: targetDay,
            },
          });
        }
      }
      return {
        replyText: `${day} cleared — pushed everything to ${targetDay}.`,
        toolCalls: calls,
      };
    }
  }

  return null;
}

function todayDayLabel(plan: WeekPlan): DayLabel {
  const today = DAY_LABELS[(new Date().getDay() + 6) % 7];
  if (plan.days.some((d) => d.dayLabel === today)) return today;
  return plan.days[0]?.dayLabel as DayLabel;
}

function normalizeDay(raw: string): DayLabel | null {
  const lower = raw.toLowerCase();
  for (const label of DAY_LABELS) {
    if (
      lower === label.toLowerCase() ||
      lower === fullDayName(label).toLowerCase()
    ) {
      return label;
    }
  }
  return null;
}

function padHHMM(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h < 0 || h > 23) return null;
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  if (mm < 0 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function fullDayName(short: DayLabel): string {
  return (
    {
      Mon: "Monday",
      Tue: "Tuesday",
      Wed: "Wednesday",
      Thu: "Thursday",
      Fri: "Friday",
      Sat: "Saturday",
      Sun: "Sunday",
    } satisfies Record<DayLabel, string>
  )[short];
}
