/**
 * POST /api/plan/chat
 *
 * Function-calling Planner Assistant. The student says "I'm sick today,
 * push everything to the weekend" and the LLM emits a sequence of
 * `move_slot` tool calls. Each call is executed server-side against the
 * plan, the resulting plan + the trace of tool calls are returned to
 * the client, and the chat panel renders both the natural-language
 * reply AND an expandable "Show reasoning" panel that lists every tool
 * that fired with its args.
 *
 * This is the AI-Fluency demo — the receipt for the "agentic workflow"
 * claim in the assignment brief.
 *
 * Three safety nets, in this order:
 *   1. NEXT_PUBLIC_DEMO_MODE → hand-authored deterministic response
 *      (matchDemoIntent → applyToolCall). The same code path runs over
 *      the calls so the UI rendering is identical to the live path.
 *   2. Live LLM call with a single tool-use round (no nested loops to
 *      keep latency bounded for the demo).
 *   3. On any error → the demo intent matcher is tried as a fallback.
 *      If that misses too, return a polite "I can do these three things"
 *      reply with no tool calls.
 */
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { DEMO_MODE } from "@/lib/flags";
import {
  applyToolCall,
  matchDemoIntent,
  PLANNER_TOOL_SCHEMAS,
  type ToolCall,
  type ToolContext,
  type ToolName,
} from "@/lib/ai/planner-tools";
import type { WeekPlan } from "@/lib/planner/types";
import { createServiceClient } from "@/lib/supabase/clients";
import { DEMO_COURSE_ID, DEMO_STUDENT } from "@/lib/demo-identity";
import { DAILY_LOAD_BUDGET, bandMessageFor } from "@/lib/planner/study-band";

const PLANNER_MODEL = "gpt-4o";

const ChatHistoryItem = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

const RequestSchema = z.object({
  plan: z.unknown(),
  userMessage: z.string().min(1),
  history: z.array(ChatHistoryItem).optional(),
  studentId: z.string().optional(),
  courseId: z.string().optional(),
});

const SYSTEM_PROMPT = `You are the Nexford Planner Assistant.

Your job is to rearrange the student's weekly study plan in response to real-life shifts. You have five tools:
  - move_slot(concept, fromDay, toDay)              — one-off relocation
  - trim_day(day, maxMinutes)                       — cap a single day
  - add_remediation(concept, day)                   — inject a 10-min review
  - set_availability_rule(label, dayOfWeek, startTime, endTime)
                                                    — persist a recurring busy window
  - clear_availability_rule(label)                  — remove a stored rule

When to use each:
  - Use move_slot / trim_day for a ONE-OFF change ("today only").
  - Use set_availability_rule whenever the student mentions an ongoing real-life commitment (work, classes outside this course, sport, family, religious observance). It writes to their calendar AND regenerates the plan in the same turn so the redistribution is visible immediately.
  - Use clear_availability_rule when they drop a commitment.

Rules:
  - ALWAYS prefer calling tools over giving advice. The user wants their week changed, not a pep talk.
  - You may call multiple tools in one turn — e.g. "I'm sick today" → call move_slot once per slot on today.
  - Use the EXACT concept tags from the plan you're given (snake_case, e.g. "depreciation", "accrual_vs_cash").
  - Day names are short labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
  - Times are 24-hour HH:MM (e.g. "08:00", "13:30", "22:00").
  - If the student says "all day", interpret as 08:00–22:00.
  - After tool calls, give ONE concise natural-language sentence summarising what changed. No emojis, no exclamation marks.
  - If the user asks for something none of the tools can do, say so in one sentence and suggest the closest tool.
  - Never invent slots that aren't in the plan.
  - DO NOT restate the weekly hour total or the 12–15h success band in your reply. The system appends a deterministic confirmation sentence about the weekly band after every tool call — saying it twice sounds robotic.`;

const DAY_LABELS_FOR_CONTEXT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function todayDayLabel(): string {
  return DAY_LABELS_FOR_CONTEXT[new Date().getDay()];
}

function planContextSummary(plan: WeekPlan): string {
  const lines: string[] = [];
  const today = todayDayLabel();
  lines.push(
    `Week starting ${plan.weekStart}. Today is ${today} (server date: ${new Date().toISOString().slice(0, 10)}). When the user says "today" they mean ${today}; "tomorrow" means the next day in the Mon-Sun sequence.`,
  );
  const weekHours = (plan.weekTotalMin / 60).toFixed(1).replace(/\.0$/, "");
  lines.push(
    `Weekly total: ${weekHours}h — band: ${plan.band} (Nexford success band: 12–15h, hard ceiling 20h).`,
  );
  for (const day of plan.days) {
    if (day.slots.length === 0) {
      lines.push(`${day.dayLabel}: rest day.`);
      continue;
    }
    const slotSummary = day.slots
      .map(
        (s) =>
          `${s.concept} (${s.conceptLabel}, ${s.durationMin}min, load ${s.load}, ${s.kind})`,
      )
      .join("; ");
    lines.push(
      `${day.dayLabel} [${day.totalLoad}/${DAILY_LOAD_BUDGET}]: ${slotSummary}`,
    );
  }
  const rules = plan.availabilityRules ?? [];
  if (rules.length > 0) {
    lines.push("");
    lines.push("Stored availability rules (recurring busy windows):");
    for (const r of rules) {
      lines.push(
        `  - "${r.label}" · ${r.dayOfWeek} ${formatMin(r.startMin)}–${formatMin(r.endMin)}`,
      );
    }
  } else {
    lines.push("");
    lines.push("No stored availability rules yet.");
  }
  return lines.join("\n");
}

function formatMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

interface ChatResponse {
  replyText: string;
  toolCalls: ToolCall[];
  updatedPlan: WeekPlan;
  source: "demo_seed" | "live_llm" | "fallback";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const plan = parsed.data.plan as WeekPlan;
  const { userMessage } = parsed.data;
  const history = parsed.data.history ?? [];
  const studentId = parsed.data.studentId ?? DEMO_STUDENT.id;
  const courseId = parsed.data.courseId ?? DEMO_COURSE_ID;

  // ToolContext: rule executors need DB + identity to persist; sync tools
  // ignore them. In DEMO_MODE we deliberately omit `sb` so the rule
  // executors take the in-memory path (no Postgres write, but still a
  // visible redistribution for the demo).
  const ctx: ToolContext = DEMO_MODE
    ? { studentId, courseId, weekStart: plan.weekStart }
    : (() => {
        try {
          return {
            sb: createServiceClient(),
            studentId,
            courseId,
            weekStart: plan.weekStart,
          };
        } catch {
          return { studentId, courseId, weekStart: plan.weekStart };
        }
      })();

  // Path 1: demo mode → deterministic preset
  if (DEMO_MODE) {
    return NextResponse.json(await runDemoPath(plan, userMessage, ctx));
  }

  // Path 2: live LLM with single tool-use round
  try {
    const live = await runLivePath(plan, userMessage, history, ctx);
    return NextResponse.json(live);
  } catch (err) {
    console.error("[planner/chat] live failure:", err);
    // Path 3: graceful fallback to the demo matcher (covers the chips)
    return NextResponse.json(
      await runDemoPath(plan, userMessage, ctx, "fallback"),
    );
  }
}

async function runDemoPath(
  plan: WeekPlan,
  userMessage: string,
  ctx: ToolContext,
  sourceOverride?: "fallback",
): Promise<ChatResponse> {
  const matched = matchDemoIntent(userMessage, plan);
  if (!matched) {
    return {
      replyText:
        "I can move slots between days, trim a day to fit a tighter window, add a remediation review, or store a recurring busy window like 'I work all day Wednesday'. Try one of the chips below or rephrase using one of those patterns.",
      toolCalls: [],
      updatedPlan: plan,
      source: sourceOverride ?? "demo_seed",
    };
  }
  let working = plan;
  const toolCalls: ToolCall[] = [];
  for (let i = 0; i < matched.toolCalls.length; i++) {
    const c = matched.toolCalls[i];
    const out = await applyToolCall(
      working,
      {
        id: `demo-${i}`,
        name: c.name,
        rawArgs: JSON.stringify(c.args),
      },
      ctx,
    );
    working = out.plan;
    toolCalls.push(out.toolCall);
  }
  const replyText =
    toolCalls.length > 0
      ? `${matched.replyText} ${bandMessageFor(working.band, working.weekTotalMin)}`
      : matched.replyText;
  return {
    replyText,
    toolCalls,
    updatedPlan: working,
    source: sourceOverride ?? "demo_seed",
  };
}

async function runLivePath(
  plan: WeekPlan,
  userMessage: string,
  history: { role: "user" | "assistant"; text: string }[],
  ctx: ToolContext,
): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `Current plan context:\n${planContextSummary(plan)}`,
    },
    ...history.slice(-6).map((h) => ({
      role: h.role,
      content: h.text,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    { role: "user", content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: PLANNER_MODEL,
    messages,
    tools: PLANNER_TOOL_SCHEMAS,
    tool_choice: "auto",
    temperature: 0.2,
    max_tokens: 512,
  });

  const choice = completion.choices[0];
  const rawToolCalls = choice?.message?.tool_calls ?? [];

  let working = plan;
  const toolCalls: ToolCall[] = [];

  for (const raw of rawToolCalls) {
    if (raw.type !== "function") continue;
    const out = await applyToolCall(
      working,
      {
        id: raw.id,
        name: raw.function.name as ToolName,
        rawArgs: raw.function.arguments ?? "{}",
      },
      ctx,
    );
    working = out.plan;
    toolCalls.push(out.toolCall);
  }

  // If the model called tools, do a second pass to get a clean human
  // summary that knows what actually happened (status: ok / noop / error).
  let replyText = (choice?.message?.content ?? "").trim();
  if (toolCalls.length > 0) {
    const summaryMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: rawToolCalls,
        },
        ...rawToolCalls.map((raw, i) => ({
          role: "tool" as const,
          tool_call_id: raw.id,
          content: JSON.stringify(toolCalls[i]?.result ?? {}),
        })),
      ];
    const summary = await client.chat.completions.create({
      model: PLANNER_MODEL,
      messages: summaryMessages,
      temperature: 0.2,
      max_tokens: 160,
    });
    replyText = (summary.choices[0]?.message?.content ?? "").trim();
  }

  if (!replyText) {
    replyText =
      toolCalls.length > 0
        ? "Done — your plan is updated."
        : "I'm not sure how to apply that. Try one of the chips below.";
  }

  // Append the deterministic Nexford-success-band confirmation. The system
  // prompt instructs the LLM not to restate hours, so this is the single
  // canonical mention per turn that includes any plan mutation.
  if (toolCalls.length > 0) {
    replyText = `${replyText} ${bandMessageFor(working.band, working.weekTotalMin)}`;
  }

  return {
    replyText,
    toolCalls,
    updatedPlan: working,
    source: "live_llm",
  };
}
