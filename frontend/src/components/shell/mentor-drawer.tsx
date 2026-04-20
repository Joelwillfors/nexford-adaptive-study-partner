"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronDown,
  GraduationCap,
  RotateCcw,
  Sparkles,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuizMessage } from "@/components/shell/quiz-message";
import { RecapMessage } from "@/components/shell/recap-message";
import type { AssistantMessage } from "@/lib/ai/schemas";
import {
  DEMO_COURSE_ID,
  DEMO_STUDENT,
  getOrCreateSessionId,
  resetSessionId,
} from "@/lib/demo-identity";

type Mode = "socratic" | "direct";

// Format a snake_case concept tag for UI display, e.g.
// "matching_principle" -> "Matching Principle".
function formatConceptTag(tag: string): string {
  return tag
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface MentorMessage {
  id: string;
  role: "user" | "mentor" | "system";
  createdAt: string;
  content: AssistantMessage;
  sources?: { name: string; similarity: number }[];
  mode?: Mode;
  quizResponse?: { selectedIndex: number; correct: boolean };
  isVictoryLap?: boolean;
}

interface MentorDrawerProps {
  currentModuleId?: string;
  currentModuleTitle?: string;
  deadline?: string;
  courseId?: string;
  onClose?: () => void;
}

export function MentorDrawer({
  currentModuleId,
  currentModuleTitle,
  deadline,
  courseId = DEMO_COURSE_ID,
  onClose,
}: MentorDrawerProps) {
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("socratic");
  const [sessionId, setSessionId] = useState<string>("");
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track the most recent quiz message so we can pin IT (not the new mentor
  // text) when a quiz_answer scroll fires — both the in-place quiz result
  // and the mentor's follow-up text stay visible in one screen.
  const lastQuizIdRef = useRef<string | null>(null);

  // ── Smart scroll state ──────────────────────────────────────────
  // messageRefs: stable per-message wrapper so quiz/text variants share a ref
  // lastScrolledIdRef: only scroll when a new tail message appears (ignores
  //   mutations to existing messages like setting quizResponse)
  // lastUserActionRef: drives the type-aware policy ("nearest" after quiz
  //   answer to keep the quiz visible, "bottom" after a normal message)
  // userScrolledUpRef: pauses auto-scroll if the user manually scrolled up
  //   so the chat doesn't yank focus while they're re-reading
  // suppressScrollDetectUntilRef: ignore programmatic-scroll events so our
  //   own smooth-scroll doesn't register as a "user scrolled up"
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const lastScrolledIdRef = useRef<string | null>(null);
  const lastUserActionRef = useRef<
    "message" | "quiz_answer" | "checkpoint" | null
  >(null);
  const userScrolledUpRef = useRef(false);
  const suppressScrollDetectUntilRef = useRef(0);

  // ── Serial quiz gate ────────────────────────────────────────────
  // pendingCheckpointsRef holds concept_tags whose checkpoint fired while
  // another quiz was still open or the drawer was mid-request. We drain one
  // per completion so quizzes arrive sequentially, never in a burst.
  // messagesRef mirrors `messages` so the gate logic (inside callbacks with
  // stale closures) can read the latest message list without re-renders.
  const pendingCheckpointsRef = useRef<string[]>([]);
  const messagesRef = useRef<MentorMessage[]>([]);

  // ── Focus-from-Journey state ────────────────────────────────────
  // When the student clicks "Let's work on it" in the Journey view, the
  // LmsShell dispatches a `nx:focus` CustomEvent with the canonical
  // concept_tag. We stash the framed prompt here until sessionId is ready
  // and the drawer is idle, then fire it as a normal student message.
  // `focusConcept` also drives a small header pill that gives the student
  // visual context ("Continuing from your Journey — <Concept>") so they
  // understand why the mentor is opening cold on a specific scenario.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [focusConcept, setFocusConcept] = useState<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "mentor",
          createdAt: new Date().toISOString(),
          content: {
            type: "text",
            text: currentModuleTitle
              ? `Ready when you are. Ask anything about ${currentModuleTitle}, or keep reading — I will check in when you finish the section.`
              : "Ready when you are. Ask a question about the material to begin.",
          },
          mode: "socratic",
        },
      ]);
    }
  }, [currentModuleTitle, messages.length]);

  // Type-aware scroll policy — only fires when a NEW tail message appears.
  // Loading state changes no longer force a snap.
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    if (lastMsg.id === lastScrolledIdRef.current) return;
    lastScrolledIdRef.current = lastMsg.id;
    if (userScrolledUpRef.current) {
      if (lastMsg.role === "mentor") setHasUnreadBelow(true);
      return;
    }

    const container = scrollRef.current;
    if (!container) return;
    const node = messageRefs.current.get(lastMsg.id);

    const scrollToBottom = () => {
      suppressScrollDetectUntilRef.current = Date.now() + 600;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    };

    const scrollNodeIntoView = (block: ScrollLogicalPosition) => {
      if (!node) {
        scrollToBottom();
        return;
      }
      suppressScrollDetectUntilRef.current = Date.now() + 600;
      node.scrollIntoView({ block, behavior: "smooth" });
    };

    if (lastMsg.role === "user") {
      scrollToBottom();
      return;
    }

    if (lastMsg.content.type === "quiz") {
      scrollNodeIntoView("start");
      return;
    }

    if (lastUserActionRef.current === "quiz_answer") {
      // Mentor text arriving right after the student answered a quiz:
      // pin the QUIZ message (with its in-place result) at the top of the
      // viewport so both the quiz feedback and the new mentor text below
      // are visible together.
      const quizId = lastQuizIdRef.current;
      const quizNode = quizId ? messageRefs.current.get(quizId) : null;
      if (quizNode) {
        suppressScrollDetectUntilRef.current = Date.now() + 600;
        quizNode.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        scrollNodeIntoView("nearest");
      }
      lastUserActionRef.current = null;
      return;
    }

    scrollToBottom();
  }, [messages]);

  // Detect manual scroll-up so we don't yank focus while the student re-reads.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      if (Date.now() < suppressScrollDetectUntilRef.current) return;
      const distance =
        container.scrollHeight - container.clientHeight - container.scrollTop;
      const atBottom = distance < 50;
      userScrolledUpRef.current = !atBottom;
      if (atBottom) setHasUnreadBelow(false);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  function appendMentor(data: {
    message?: AssistantMessage;
    sources?: { name: string; similarity: number }[];
    mode?: Mode;
    isVictoryLap?: boolean;
    recap?: AssistantMessage | null;
  }) {
    if (!data?.message) return;

    const id = crypto.randomUUID();
    if (data.message.type === "quiz") {
      lastQuizIdRef.current = id;
    }
    setMessages((prev) => {
      const next: MentorMessage[] = [
        ...prev,
        {
          id,
          role: "mentor",
          createdAt: new Date().toISOString(),
          content: data.message!,
          sources: data.sources,
          mode: data.mode ?? mode,
          isVictoryLap: data.isVictoryLap === true,
        },
      ];
      // Victory Lap: append the recap card as a second mentor message so both
      // the short ack text (first bubble) and the recap card (second bubble)
      // live in the drawer as separate scroll targets. The recap is also
      // flagged isVictoryLap so isQuizSealed detects it when the student goes
      // back to an earlier quiz on the now-closed concept.
      if (data.recap && data.recap.type === "recap") {
        next.push({
          id: crypto.randomUUID(),
          role: "mentor",
          createdAt: new Date().toISOString(),
          content: data.recap,
          mode: data.mode ?? mode,
          isVictoryLap: true,
        });
      }
      return next;
    });
    if (data.mode && data.mode !== mode) setMode(data.mode);
  }

  const lmsContext = {
    currentModuleTitle,
    deadline,
  };

  const handleCheckpoint = useCallback(
    async (concept: string) => {
      if (!sessionId) return;
      lastUserActionRef.current = "checkpoint";
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "checkpoint",
            concept,
            courseId,
            userId: DEMO_STUDENT.id,
            sessionId,
            lms: lmsContext,
          }),
        });
        const data = await res.json();
        appendMentor(data);
      } catch {
        // silent — UI stays stable
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, sessionId, currentModuleTitle, deadline],
  );

  // hasOpenQuiz: the most-recent quiz mentor message hasn't been answered yet.
  // We walk from the tail so we ignore older quizzes the student already closed.
  function hasOpenQuiz(msgs: MentorMessage[]): boolean {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "mentor") continue;
      if (m.content.type === "quiz") return !m.quizResponse;
    }
    return false;
  }

  // Has this concept already been surfaced as a quiz in this session? Used
  // when draining the queue so a stale entry never produces a duplicate quiz
  // for a concept the student already answered in another way.
  function conceptAlreadyAsked(concept: string, msgs: MentorMessage[]): boolean {
    return msgs.some(
      (m) =>
        m.role === "mentor" &&
        m.content.type === "quiz" &&
        m.content.concept_tag === concept,
    );
  }

  const drainPendingCheckpoints = useCallback(() => {
    while (pendingCheckpointsRef.current.length > 0) {
      if (hasOpenQuiz(messagesRef.current)) return;
      const next = pendingCheckpointsRef.current.shift();
      if (!next) return;
      if (conceptAlreadyAsked(next, messagesRef.current)) continue;
      handleCheckpoint(next);
      return;
    }
  }, [handleCheckpoint]);

  useEffect(() => {
    const listener = (e: Event) => {
      const custom = e as CustomEvent<{ concept: string }>;
      const concept = custom.detail?.concept;
      if (!concept) return;

      const busy = loading || hasOpenQuiz(messagesRef.current);
      const alreadyQueued = pendingCheckpointsRef.current.includes(concept);
      const alreadyAsked = conceptAlreadyAsked(concept, messagesRef.current);
      if (alreadyAsked || alreadyQueued) return;

      if (busy) {
        pendingCheckpointsRef.current.push(concept);
        return;
      }
      handleCheckpoint(concept);
    };
    window.addEventListener("nx:checkpoint", listener);
    return () => window.removeEventListener("nx:checkpoint", listener);
  }, [handleCheckpoint, loading]);

  // nx:focus — fired by LmsShell when the user arrives at a lesson from
  // "Let's work on it" on the Journey view. We stash a scenario-framed
  // prompt, then a drain effect below fires it once sessionId is ready and
  // the drawer is idle. This keeps the event listener lightweight and
  // robust against session bootstrap timing.
  useEffect(() => {
    const listener = (e: Event) => {
      const custom = e as CustomEvent<{ concept: string }>;
      const concept = custom.detail?.concept;
      if (!concept) return;
      const label = formatConceptTag(concept);
      const framed = `I want to work on ${label}. Can we walk through a fresh scenario?`;
      setFocusConcept(concept);
      setInput(framed);
      setPendingFocus(framed);
    };
    window.addEventListener("nx:focus", listener);
    return () => window.removeEventListener("nx:focus", listener);
  }, []);

  // nx:explain — fired by LessonReader when the student selects a paragraph
  // and clicks "Explain this". We frame the anchor as a hidden student
  // message and queue it through the same focus pipeline so the existing
  // gating (sessionId ready, drawer idle, soft 400ms reveal) applies.
  useEffect(() => {
    const listener = (e: Event) => {
      const custom = e as CustomEvent<{ anchor: string; concept?: string }>;
      const anchor = custom.detail?.anchor?.trim();
      if (!anchor) return;
      const concept = custom.detail?.concept;
      const trimmed =
        anchor.length > 320 ? `${anchor.slice(0, 317)}…` : anchor;
      const framed = `Can you explain this for me with a concrete example? "${trimmed}"`;
      if (concept) setFocusConcept(concept);
      setInput(framed);
      setPendingFocus(framed);
    };
    window.addEventListener("nx:explain", listener);
    return () => window.removeEventListener("nx:explain", listener);
  }, []);

  // Drain a queued focus request once the drawer is ready. We intentionally
  // wait ~400ms so the prefilled input is visible for a beat before the
  // auto-submit fires — it reads as "the mentor saw you" rather than
  // swallowing the click silently.
  useEffect(() => {
    if (!sessionId || loading || !pendingFocus) return;
    const toSend = pendingFocus;
    const timer = setTimeout(() => {
      setPendingFocus(null);
      setInput("");
      sendMessage(toSend);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, loading, pendingFocus]);

  async function sendMessage(text: string) {
    if (!text || loading || !sessionId) return;
    userScrolledUpRef.current = false;
    lastUserActionRef.current = "message";
    const userMsg: MentorMessage = {
      id: crypto.randomUUID(),
      role: "user",
      createdAt: new Date().toISOString(),
      content: { type: "text", text },
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "message",
          question: text,
          courseId,
          userId: DEMO_STUDENT.id,
          sessionId,
          lms: lmsContext,
        }),
      });
      const data = await res.json();
      appendMentor(data);
    } catch {
      appendMentor({
        message: {
          type: "text",
          text: "Briefly disconnected. Try once more.",
        },
      });
    } finally {
      setLoading(false);
      drainPendingCheckpoints();
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !sessionId) return;
    setInput("");
    await sendMessage(text);
  }

  function handleReset() {
    const next = resetSessionId();
    setSessionId(next);
    setMessages([]);
    setMode("socratic");
    setInput("");
    setLoading(false);
    setHasUnreadBelow(false);
    setFocusConcept(null);
    lastScrolledIdRef.current = null;
    lastUserActionRef.current = null;
    lastQuizIdRef.current = null;
    userScrolledUpRef.current = false;
    pendingCheckpointsRef.current = [];
    setPendingFocus(null);
  }

  // A quiz is "sealed" once its concept has been closed by a Victory Lap or
  // a session recap anywhere in the session. We match by concept_tag so a
  // quiz on concept A stays re-answerable even after concept B was closed.
  // Fallback: if neither side carries a concept_tag, fall back to the old
  // "any closure after the quiz" heuristic (keeps demo-fixture flows working).
  function isQuizSealed(quizId: string, msgs: MentorMessage[]): boolean {
    const idx = msgs.findIndex((m) => m.id === quizId);
    if (idx === -1) return false;
    const target = msgs[idx];
    if (target.content.type !== "quiz") return false;
    const quizTag = target.content.concept_tag;

    const closingMsgs = msgs
      .map((m, i) => ({ m, i }))
      .filter(
        ({ m }) =>
          m.role === "mentor" &&
          (m.content.type === "recap" || m.isVictoryLap === true),
      );
    if (closingMsgs.length === 0) return false;

    // Prefer concept_tag matching when available on both sides.
    if (quizTag) {
      return closingMsgs.some(({ m }) => {
        const closingTag =
          m.content.type === "recap"
            ? m.content.concept_tag
            : m.content.type === "text"
              ? m.content.concept_tag
              : undefined;
        return closingTag === quizTag;
      });
    }

    // Fallback: any closure AFTER the quiz seals it (legacy behaviour).
    return closingMsgs.some(({ i }) => i > idx);
  }

  async function answerQuiz(
    messageId: string,
    selectedIndex: number,
    confidence: "guessing" | "fairly_sure" | "certain",
  ) {
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.content.type !== "quiz" || !sessionId) return;
    const correct = target.content.correct_index === selectedIndex;

    // Mark this as a quiz_answer and pin the scroll target to THIS quiz so
    // the mentor's follow-up text is revealed below it with the quiz + its
    // in-place result both visible at the top of the viewport.
    lastUserActionRef.current = "quiz_answer";
    lastQuizIdRef.current = messageId;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, quizResponse: { selectedIndex, correct } }
          : m,
      ),
    );

    // Pass/fail signal for the lesson reader's strict pagination.
    // Anything subscribed to nx:checkpoint-result (currently the
    // LessonReader on /learn/[moduleId]) gets a binary outcome plus the
    // concept tag so it can unlock the next part or hold the line.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("nx:checkpoint-result", {
          detail: {
            concept: target.content.concept_tag,
            passed: correct,
          },
        }),
      );
    }

    if (isQuizSealed(messageId, messages)) {
      const sealedText = correct
        ? "Yes — that one's right. We've already closed this topic, so no need to unpack it again."
        : "Actually the other option was the correct read — but we've already wrapped this topic, so we won't reopen it here.";
      appendMentor({
        message: { type: "text", text: sealedText },
        mode,
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "quiz_response",
          courseId,
          userId: DEMO_STUDENT.id,
          sessionId,
          concept_tag: target.content.concept_tag,
          selected_index: selectedIndex,
          correct,
          confidence,
          lms: lmsContext,
        }),
      });
      const data = await res.json();
      appendMentor(data);
    } finally {
      setLoading(false);
      drainPendingCheckpoints();
    }
  }

  function scrollToBottomManual() {
    const container = scrollRef.current;
    if (!container) return;
    suppressScrollDetectUntilRef.current = Date.now() + 600;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    userScrolledUpRef.current = false;
    setHasUnreadBelow(false);
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e7eb] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#fefce8]">
            <Sparkles className="h-3.5 w-3.5 text-[#0f0f0f]" />
          </div>
          <span className="text-sm font-semibold text-[#0f0f0f]">Mentor</span>
          <ModePill mode={mode} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
            aria-label="Reset chat"
            title="Reset chat — start a fresh session"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
              aria-label="Close mentor"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {focusConcept && (
          <motion.div
            key="focus-pill"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[#fde047] bg-[#fefce8] px-4 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#92400e]" />
              <span className="truncate text-xs text-[#0f0f0f]">
                Continuing from your Journey —{" "}
                <span className="font-semibold">
                  {formatConceptTag(focusConcept)}
                </span>
              </span>
            </div>
            <button
              onClick={() => setFocusConcept(null)}
              className="shrink-0 rounded-md p-1 text-[#92400e] hover:bg-[#fde047]/40"
              aria-label="Dismiss Journey context"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((m, idx, arr) => {
            // Walk back to find the most recent prior mentor message's
            // concept_tag so MessageBubble can decide whether to render a
            // "Topic" pill (only when the concept changes).
            const prevMentorTag = (() => {
              for (let i = idx - 1; i >= 0; i--) {
                const prev = arr[i];
                if (prev.role !== "mentor") continue;
                const c = prev.content;
                if (
                  c.type === "text" ||
                  c.type === "quiz" ||
                  c.type === "recap"
                ) {
                  return c.concept_tag ?? null;
                }
                return null;
              }
              return null;
            })();
            return (
              <div
                key={m.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(m.id, el);
                  else messageRefs.current.delete(m.id);
                }}
                data-role={m.role}
                data-type={m.content.type}
              >
                <MessageBubble
                  message={m}
                  onQuizAnswer={answerQuiz}
                  prevMentorTag={prevMentorTag}
                />
              </div>
            );
          })}
          {loading && <TypingIndicator />}
        </div>
      </div>

      <AnimatePresence>
        {hasUnreadBelow && (
          <motion.button
            key="unread-pill"
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToBottomManual}
            className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#0f0f0f] px-3 py-1.5 text-xs font-medium text-white shadow-md ring-1 ring-black/10 hover:bg-[#1f1f1f]"
            aria-label="Scroll to latest message"
          >
            <ChevronDown className="h-3 w-3 animate-bounce" />
            New message
          </motion.button>
        )}
      </AnimatePresence>

      <form
        onSubmit={submit}
        className="shrink-0 border-t border-[#e5e7eb] bg-white p-3"
      >
        <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-1 focus-within:border-[#0f0f0f] focus-within:ring-1 focus-within:ring-[#0f0f0f]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the mentor…"
            className="flex-1 bg-transparent py-2 text-sm text-[#0f0f0f] placeholder:text-[#9ca3af] focus:outline-none"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            variant={input.trim() ? "secondary" : "ghost"}
            disabled={!input.trim() || loading}
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ModePill({ mode }: { mode: Mode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
      >
        <Badge
          variant={mode === "socratic" ? "brand" : "dark"}
          className="ml-1"
        >
          {mode === "socratic" ? (
            <>
              <Brain className="h-3 w-3" />
              Socratic
            </>
          ) : (
            <>
              <GraduationCap className="h-3 w-3" />
              Direct
            </>
          )}
        </Badge>
      </motion.div>
    </AnimatePresence>
  );
}

function MessageBubble({
  message,
  onQuizAnswer,
  prevMentorTag,
}: {
  message: MentorMessage;
  onQuizAnswer: (
    id: string,
    idx: number,
    conf: "guessing" | "fairly_sure" | "certain",
  ) => void;
  prevMentorTag?: string | null;
}) {
  const { role, content } = message;
  const isUser = role === "user";

  if (content.type === "quiz") {
    return (
      <QuizMessage
        message={content}
        response={message.quizResponse}
        onAnswer={(idx, conf) => onQuizAnswer(message.id, idx, conf)}
      />
    );
  }

  if (content.type === "recap") {
    return <RecapMessage message={content} />;
  }

  const isExitCondition =
    role === "mentor" &&
    /\b(spot on|excellent|precisely|correct)\b/i.test(content.text);

  // Show a "Topic" pill only on mentor text messages when the concept_tag
  // differs from the previous mentor turn's tag. Keeps long exchanges on
  // one topic visually calm while clearly signalling topic transitions.
  const currentTag =
    content.type === "text" ? content.concept_tag ?? null : null;
  const showTopicPill =
    role === "mentor" &&
    !!currentTag &&
    currentTag !== (prevMentorTag ?? null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-[#0f0f0f] text-white"
            : "border border-[#e5e7eb] bg-[#f9fafb] text-[#0f0f0f]",
          isExitCondition &&
            "border-l-4 border-l-[#ffb300] bg-[#fefce8] text-[#0f0f0f]",
        )}
      >
        {showTopicPill && currentTag && (
          <div className="mb-1.5">
            <span className="inline-flex items-center rounded-md bg-[#0f0f0f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#ffb300]">
              Topic · {formatConceptTag(currentTag)}
            </span>
          </div>
        )}
        {content.text}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
        <div className="flex gap-1">
          {[0, 0.15, 0.3].map((d, i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#9ca3af]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: d }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
