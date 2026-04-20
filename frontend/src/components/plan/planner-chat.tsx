"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cog,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  Wand2,
  X,
} from "lucide-react";
import type { WeekPlan } from "@/lib/planner/types";

/**
 * PlannerChat — function-calling chat panel for the /plan page.
 *
 * Hits POST /api/plan/chat. The endpoint runs an OpenAI tool-use loop
 * over three planner tools (move_slot / trim_day / add_remediation),
 * applies the resulting tool calls to the plan server-side, and returns
 * { replyText, toolCalls[], updatedPlan }.
 *
 * Each assistant turn renders an expandable "Show reasoning" panel that
 * lists every tool call with its args + the executor's status. This is
 * the AI Fluency receipt — it makes the agentic workflow visible.
 *
 * Demo-mode safety nets live in the API route, not here. The UI is the
 * same whether the response came from the live LLM or a deterministic
 * preset.
 */
interface PlannerChatProps {
  plan: WeekPlan;
  setPlan: (next: WeekPlan) => void;
}

interface ToolCallTrace {
  name: string;
  args: Record<string, unknown>;
  result: { status: "ok" | "noop" | "error"; message: string };
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  toolCalls?: ToolCallTrace[];
  source?: "demo_seed" | "live_llm" | "fallback";
}

const QUICK_CHIPS = [
  "I'm sick today, push everything to the weekend",
  "I only have 30 mins today",
  "I work all day Wednesday",
  "I have soccer Tuesdays at 18:00 to 19:30",
];

const FALLBACK_BUBBLE: ChatTurn = {
  id: "welcome",
  role: "assistant",
  text: "Hi — I'm Atlas, your planner. I can rearrange the week if your real life shifts. Try a chip below.",
};

export function PlannerChat({ plan, setPlan }: PlannerChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([FALLBACK_BUBBLE]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, open, busy]);

  async function send(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;

    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setBusy(true);

    try {
      const history = turns
        .filter((t) => t.role !== "system")
        .map((t) => ({ role: t.role as "user" | "assistant", text: t.text }));

      const res = await fetch("/api/plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          userMessage: text,
          history,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: {
        replyText: string;
        toolCalls: ToolCallTrace[];
        updatedPlan: WeekPlan;
        source: "demo_seed" | "live_llm" | "fallback";
      } = await res.json();

      setPlan(data.updatedPlan);
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.replyText,
          toolCalls: data.toolCalls,
          source: data.source,
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            err instanceof Error
              ? `Sorry — ${err.message}. Try again or use one of the chips below.`
              : "Sorry — that failed. Try one of the chips below.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="planner-chat-fab"
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#0f0f0f] px-4 py-3 text-sm font-semibold text-[#ffb300] shadow-lg transition hover:bg-[#1f1f1f]"
          >
            <Wand2 className="h-4 w-4" />
            Plan with Atlas
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="planner-chat-panel"
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed bottom-6 right-6 top-24 z-40 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-[#f3f4f6] bg-[#fefce8] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ffb300]">
                  <Wand2 className="h-3.5 w-3.5 text-[#0f0f0f]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0f0f0f]">
                    Atlas
                  </p>
                  <p className="text-[10px] text-[#92400e]">
                    Function-calling · 5 tools (move / trim / remediate / availability)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close planner chat"
                className="rounded-md p-1 text-[#6b7280] transition hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto bg-[#fafafa] px-4 py-4"
            >
              {turns.map((t) => (
                <ChatBubble key={t.id} turn={t} />
              ))}
              {busy && <ReasoningIndicator />}
            </div>

            <div className="space-y-2 border-t border-[#f3f4f6] bg-white px-3 py-3">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => send(chip)}
                    disabled={busy}
                    className="rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0f0f0f] transition hover:border-[#ffb300] hover:bg-[#fefce8] disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-center gap-2"
              >
                <div className="flex flex-1 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 focus-within:border-[#ffb300]">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g., I'm sick today, push everything to the weekend"
                    className="flex-1 bg-transparent text-sm placeholder:text-[#9ca3af] focus:outline-none"
                    disabled={busy}
                  />
                </div>
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f0f0f] text-[#ffb300] transition hover:bg-[#1f1f1f] disabled:opacity-50"
                  disabled={!input.trim() || busy}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  const hasReasoning = (turn.toolCalls?.length ?? 0) > 0;
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-snug ${
          isUser
            ? "bg-[#0f0f0f] text-white"
            : "border border-[#e5e7eb] bg-white text-[#0f0f0f]"
        }`}
      >
        {turn.text}
      </div>
      {!isUser && hasReasoning && (
        <ReasoningPanel toolCalls={turn.toolCalls!} source={turn.source} />
      )}
    </div>
  );
}

function ReasoningPanel({
  toolCalls,
  source,
}: {
  toolCalls: ToolCallTrace[];
  source?: "demo_seed" | "live_llm" | "fallback";
}) {
  const [open, setOpen] = useState(false);
  const okCount = toolCalls.filter((c) => c.result.status === "ok").length;
  const noopCount = toolCalls.filter((c) => c.result.status === "noop").length;
  const errCount = toolCalls.filter((c) => c.result.status === "error").length;

  return (
    <div className="mt-1.5 w-full max-w-[90%]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[#e5e7eb] bg-white px-2 py-1 text-[10px] font-medium text-[#6b7280] transition hover:border-[#0f0f0f] hover:text-[#0f0f0f]"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Cog className="h-3 w-3" />
        Show reasoning · {toolCalls.length} tool call
        {toolCalls.length === 1 ? "" : "s"}
        {okCount > 0 && (
          <span className="text-[#16a34a]">· {okCount} ok</span>
        )}
        {noopCount > 0 && (
          <span className="text-[#a16207]">· {noopCount} noop</span>
        )}
        {errCount > 0 && (
          <span className="text-[#dc2626]">· {errCount} err</span>
        )}
        {source && (
          <span className="ml-1 rounded bg-[#f3f4f6] px-1 py-0.5 text-[9px] uppercase tracking-wider text-[#6b7280]">
            {source === "live_llm"
              ? "live"
              : source === "demo_seed"
                ? "demo"
                : "fallback"}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-md border border-[#e5e7eb] bg-[#fafafa] px-2 py-2">
          {toolCalls.map((tc, i) => (
            <ToolCallRow key={i} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolCallTrace }) {
  const Icon =
    call.result.status === "ok"
      ? CheckCircle2
      : call.result.status === "noop"
        ? CircleAlert
        : CircleAlert;
  const tone =
    call.result.status === "ok"
      ? "text-[#16a34a]"
      : call.result.status === "noop"
        ? "text-[#a16207]"
        : "text-[#dc2626]";
  return (
    <div className="rounded border border-[#f3f4f6] bg-white px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${tone}`} />
        <code className="text-[10px] font-mono text-[#0f0f0f]">
          {call.name}({formatArgs(call.args)})
        </code>
      </div>
      <p className="mt-0.5 pl-4 text-[10px] leading-snug text-[#6b7280]">
        {call.result.message}
      </p>
    </div>
  );
}

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => {
    const val = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
    return `${k}: ${val}`;
  });
  return parts.join(", ");
}

function ReasoningIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[#e5e7eb] bg-white px-3 py-2 text-xs text-[#6b7280]">
      <Loader2 className="h-3 w-3 animate-spin" />
      Atlas is reasoning…
    </div>
  );
}
