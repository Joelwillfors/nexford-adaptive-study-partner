"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Lesson } from "@/lib/lessons/registry";
import {
  PARTS_UPDATE_EVENT,
  readPartsProgress,
  writePartsProgress,
  type PartsUpdateDetail,
} from "@/lib/learn/parts-progress";
import { canonicalConceptTag } from "@/lib/ai/concept-canon";

interface LessonReaderProps {
  lesson: Lesson;
  moduleNumber: number;
  /**
   * Opt-in to the legacy scroll-triggered checkpoints. Default OFF
   * because the redesigned reader uses strict pass-to-unlock
   * pagination — the deliberate CTA replaces the serendipitous mid-
   * scroll quiz pop. Kept as a prop so we can re-enable for surfaces
   * that still want the dwell behaviour (e.g., a "passive review"
   * mode for re-reads).
   */
  enableScrollCheckpoints?: boolean;
}

/**
 * Lesson reader — strict pass-to-unlock pagination (Block 3 redesign).
 *
 * 1. **One part visible at a time.** Only the first `unlockedParts`
 *    sections are mounted. This ends the "everything visible at once"
 *    cognitive overload of the previous long-scroll layout.
 *
 * 2. **Pass to unlock.** Each part ends in a single "Test your
 *    understanding" CTA. Clicking it queues a checkpoint quiz for that
 *    part's concept only — no cross-part interference. The MentorDrawer
 *    fires `nx:checkpoint-result` with `{concept, passed}` after the
 *    student answers; we listen and either:
 *      - passed → advance `unlockedParts`, scroll the new section in,
 *      - failed → keep the current part as the gate, switch the CTA
 *        to "Try the question again", surface a thin amber toast.
 *
 * 3. **Contextual "Explain this".** Hover any paragraph to ask the
 *    mentor for a worked example anchored on that exact text.
 *
 * 4. **Scroll checkpoints are off by default.** The
 *    IntersectionObserver dwell logic from the polish sprint stays in
 *    the file behind `enableScrollCheckpoints`, in case we want to
 *    re-enable it for a different surface later.
 */
const ARMING_DELAY_MS = 10_000;
const DWELL_MS = 2_000;
const TOAST_MS = 5_000;

export function LessonReader({
  lesson,
  moduleNumber,
  enableScrollCheckpoints = false,
}: LessonReaderProps) {
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const firedRef = useRef<Set<string>>(new Set());
  const pendingTimersRef = useRef<Map<string, number>>(new Map());
  const armedRef = useRef<boolean>(false);
  const [completedSections, setCompletedSections] = useState<Set<string>>(
    new Set(),
  );
  // Initialize from sessionStorage so a soft re-render (or sidebar
  // navigation back to the same lesson) keeps the same unlock state.
  const [unlockedParts, setUnlockedParts] = useState<number>(1);
  const [partsPassed, setPartsPassed] = useState<Set<string>>(new Set());

  // Hydrate from sessionStorage once the component mounts. We do this
  // in effect (not initial state) to keep SSR markup stable.
  useEffect(() => {
    const initial = readPartsProgress(lesson.moduleId);
    setUnlockedParts(initial.unlockedParts);
    setPartsPassed(new Set(initial.partsPassed));
  }, [lesson.moduleId]);

  // Persist + broadcast on every change so the sidebar's PartItem
  // components update without a page reload.
  useEffect(() => {
    writePartsProgress(lesson.moduleId, {
      unlockedParts,
      partsPassed: Array.from(partsPassed),
    });
  }, [lesson.moduleId, unlockedParts, partsPassed]);

  // Listen for updates fired by other surfaces (e.g. a sidebar click
  // doesn't actually mutate progress today, but if it ever does, this
  // keeps us coherent without prop drilling).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PartsUpdateDetail>).detail;
      if (!detail || detail.lessonId !== lesson.moduleId) return;
      setUnlockedParts((prev) =>
        prev === detail.unlockedParts ? prev : detail.unlockedParts,
      );
      setPartsPassed((prev) => {
        const next = new Set(detail.partsPassed);
        if (
          prev.size === next.size &&
          Array.from(prev).every((c) => next.has(c))
        ) {
          return prev;
        }
        return next;
      });
    };
    window.addEventListener(PARTS_UPDATE_EVENT, handler);
    return () => window.removeEventListener(PARTS_UPDATE_EVENT, handler);
  }, [lesson.moduleId]);
  const [activeCheckConcept, setActiveCheckConcept] = useState<string | null>(
    null,
  );
  const [lastResult, setLastResult] = useState<"pass" | "fail" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const totalParts = lesson.sections.length;
  const visibleSections = lesson.sections.slice(0, unlockedParts);
  const currentPart = visibleSections[visibleSections.length - 1];

  useEffect(() => {
    if (!enableScrollCheckpoints) return;

    const armTimer = window.setTimeout(() => {
      armedRef.current = true;
    }, ARMING_DELAY_MS);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = entry.target.getAttribute("data-section-id");
          const concept = entry.target.getAttribute("data-concept");
          if (!sectionId || !concept) continue;
          if (firedRef.current.has(sectionId)) continue;

          const inBand =
            entry.isIntersecting && entry.intersectionRatio >= 0.4;

          if (inBand) {
            if (!armedRef.current) continue;
            if (pendingTimersRef.current.has(sectionId)) continue;
            const timerId = window.setTimeout(() => {
              pendingTimersRef.current.delete(sectionId);
              if (firedRef.current.has(sectionId)) return;
              firedRef.current.add(sectionId);
              setCompletedSections((prev) => new Set(prev).add(sectionId));
              window.dispatchEvent(
                new CustomEvent("nx:checkpoint", { detail: { concept } }),
              );
            }, DWELL_MS);
            pendingTimersRef.current.set(sectionId, timerId);
          } else {
            const pending = pendingTimersRef.current.get(sectionId);
            if (pending !== undefined) {
              window.clearTimeout(pending);
              pendingTimersRef.current.delete(sectionId);
            }
          }
        }
      },
      { threshold: [0.2, 0.4, 0.6, 0.9], rootMargin: "-10% 0px -30% 0px" },
    );

    sectionRefs.current.forEach((node) => observer.observe(node));
    const pendingTimers = pendingTimersRef.current;
    return () => {
      window.clearTimeout(armTimer);
      observer.disconnect();
      pendingTimers.forEach((id) => window.clearTimeout(id));
      pendingTimers.clear();
    };
  }, [lesson.moduleId, enableScrollCheckpoints]);

  // Listen for pass/fail events from the mentor drawer to drive
  // unlock or retry. We only act on results for the part we're
  // currently gating to avoid stray events from earlier parts.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        concept?: string;
        passed?: boolean;
      };
      if (!detail?.concept || typeof detail.passed !== "boolean") return;
      if (!activeCheckConcept) return;

      // The lesson section concept is the raw form (e.g.
      // "accrual_vs_cash_timing") while the mentor-drawer dispatches
      // with the canonicalized form ("accrual_vs_cash"). Compare on
      // the canonical axis so the listener doesn't drop legit results.
      const activeCanon =
        canonicalConceptTag(activeCheckConcept) ?? activeCheckConcept;
      const incomingCanon =
        canonicalConceptTag(detail.concept) ?? detail.concept;
      if (incomingCanon !== activeCanon) return;

      if (detail.passed) {
        // Mark as passed but do NOT auto-advance. The student now sees
        // a green "Next part" CTA on the same card and chooses when to
        // move on. This keeps the rhythm deliberate and avoids
        // surprise scroll jumps.
        // Key partsPassed by the SECTION's concept (raw form) so the
        // CTA's `partsPassed.has(section.concept)` check downstream
        // matches without further canonicalization.
        setPartsPassed((prev) => new Set(prev).add(activeCheckConcept));
        setLastResult("pass");
        setActiveCheckConcept(null);
        setToast(
          unlockedParts >= totalParts
            ? "All parts passed — module complete."
            : "Nice — ready for the next part when you are.",
        );
      } else {
        setLastResult("fail");
        setToast(
          "Socrates is in the chat. Work through it together, then try again.",
        );
      }
    };
    window.addEventListener("nx:checkpoint-result", handler);
    return () => window.removeEventListener("nx:checkpoint-result", handler);
  }, [activeCheckConcept, totalParts, unlockedParts]);

  function advanceToNextPart() {
    setUnlockedParts((prev) => Math.min(prev + 1, totalParts));
    setLastResult(null);
  }

  // Smooth-scroll the newly revealed part into view when the student
  // clicks "Next part" (which bumps unlockedParts).
  const prevUnlockedRef = useRef<number>(unlockedParts);
  useEffect(() => {
    const prev = prevUnlockedRef.current;
    prevUnlockedRef.current = unlockedParts;
    if (unlockedParts <= prev) return;
    if (unlockedParts < 2) return;
    const next = lesson.sections[unlockedParts - 1];
    if (!next) return;
    const node = sectionRefs.current.get(next.id);
    if (node) {
      requestAnimationFrame(() =>
        node.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [unlockedParts, lesson.sections]);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  function triggerPartCheck() {
    if (!currentPart) return;
    if (partsPassed.has(currentPart.concept)) return;
    setActiveCheckConcept(currentPart.concept);
    setLastResult(null);
    window.dispatchEvent(
      new CustomEvent("nx:checkpoint", {
        detail: { concept: currentPart.concept },
      }),
    );
  }

  return (
    <article className="space-y-10">
      <header className="space-y-4 border-b border-[#e5e7eb] pb-8">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            MODULE {String(moduleNumber).padStart(2, "0")}
          </Badge>
          <Badge variant="brand" className="text-[10px]">
            <Clock className="h-2.5 w-2.5" />
            {lesson.sections.reduce((a, s) => a + s.estimatedMinutes, 0)} min
          </Badge>
          {totalParts > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {totalParts} part{totalParts === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-[#0f0f0f]">
          {lesson.title}
        </h1>
        <p className="max-w-prose text-lg leading-relaxed text-[#6b7280]">
          {lesson.intro}
        </p>
        {/* No streak/motivation widgets here — the focused reading view
            stays distraction-free. Cohort stats live on /portal and
            /journey. */}
      </header>

      {lesson.sections.length === 0 ? (
        <EmptyLesson />
      ) : (
        <div className="space-y-14">
          {visibleSections.map((section, idx) => (
            <section
              key={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
              }}
              data-section-id={section.id}
              data-concept={section.concept}
              className="scroll-mt-24"
            >
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
                  Part {idx + 1} of {totalParts}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <h2 className="text-2xl font-semibold tracking-tight text-[#0f0f0f]">
                    {section.heading}
                  </h2>
                  {(partsPassed.has(section.concept) ||
                    completedSections.has(section.id)) && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#6b7280]">
                      <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
                      Passed
                    </span>
                  )}
                </div>
              </div>
              <div className="max-w-prose space-y-4 text-[15px] leading-relaxed text-[#0f0f0f]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <ExplainableParagraph concept={section.concept}>
                        {children}
                      </ExplainableParagraph>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#0f0f0f]">
                        {children}
                      </strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-[#0f0f0f]">{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc space-y-1 pl-6 text-[#0f0f0f]">
                        {children}
                      </ul>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-[#f3f4f6] px-1.5 py-0.5 font-mono text-[13px] text-[#0f0f0f]">
                        {children}
                      </code>
                    ),
                  }}
                >
                  {section.markdown}
                </ReactMarkdown>
              </div>

              {/* Single CTA tied to THIS part. Stays on the current
                  (last visible) part through every state: idle ->
                  pending -> passed/failed. Even after passing it
                  remains so the student gets a deliberate "Next part"
                  button instead of an auto-scroll. */}
              {idx === visibleSections.length - 1 && (
                <div className="mt-8">
                  <PartCheckCTA
                    partNumber={idx + 1}
                    partCount={totalParts}
                    conceptLabel={section.heading}
                    state={
                      partsPassed.has(section.concept)
                        ? "passed"
                        : lastResult === "fail"
                          ? "failed"
                          : activeCheckConcept === section.concept
                            ? "pending"
                            : "idle"
                    }
                    onTrigger={triggerPartCheck}
                    onAdvance={advanceToNextPart}
                    isFinalPart={idx + 1 === totalParts}
                    nextModuleId={lesson.nextModuleId}
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${
            lastResult === "fail"
              ? "border-[#fde047] bg-[#fefce8] text-[#92400e]"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {toast}
        </div>
      )}

      {/* Next-module navigation now lives inside the final
          PartCheckCTA's "passed" state, so no separate footer needed. */}
    </article>
  );
}

type PartCheckState = "idle" | "pending" | "passed" | "failed";

function PartCheckCTA({
  partNumber,
  partCount,
  conceptLabel,
  state,
  onTrigger,
  onAdvance,
  isFinalPart,
  nextModuleId,
}: {
  partNumber: number;
  partCount: number;
  conceptLabel: string;
  state: PartCheckState;
  onTrigger: () => void;
  onAdvance: () => void;
  isFinalPart: boolean;
  nextModuleId?: string;
}) {
  // Style + copy table — keeps the four UI states declarative so
  // future tweaks don't pile up nested ternaries.
  const containerClass =
    state === "passed"
      ? "rounded-2xl border-2 border-green-300 bg-green-50 p-6 transition-colors"
      : state === "failed"
        ? "rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 p-6 transition-colors"
        : "rounded-2xl border-2 border-dashed border-[#fde047] bg-[#fefce8] p-6 transition-colors";

  const iconBgClass =
    state === "passed"
      ? "bg-green-500"
      : "bg-[#ffb300]";

  const Icon = state === "passed" ? CheckCircle2 : Sparkles;

  const headline =
    state === "passed"
      ? "Nice — you got it."
      : state === "failed"
        ? "Not quite — let's try again"
        : "Test your understanding";

  const subhead =
    state === "passed" ? (
      isFinalPart ? (
        nextModuleId ? (
          <>
            All {partCount} part{partCount === 1 ? "" : "s"} mastered.
            Onward to the next module when you&apos;re ready.
          </>
        ) : (
          <>
            All {partCount} part{partCount === 1 ? "" : "s"} mastered.
            You&apos;ve completed the course.
          </>
        )
      ) : (
        <>
          Part {partNumber} of {partCount} is in the bank. Continue when
          you&apos;re ready.
        </>
      )
    ) : state === "failed" ? (
      <>
        Work through the scenario with the mentor in the side panel —
        they&apos;ll guide you to the answer. Then come back and try the
        question again.
      </>
    ) : state === "pending" ? (
      <>
        Question is in the mentor panel. Answer it there to continue.
      </>
    ) : (
      <>
        One transfer-style scenario on{" "}
        <span className="font-medium text-[#0f0f0f]">{conceptLabel}</span>.
        Pass to unlock Part {Math.min(partNumber + 1, partCount)} of{" "}
        {partCount}. Miss it and Socrates will walk you through it before
        you retry.
      </>
    );

  // Button — three branches: passed (advance / next module / done),
  // pending (disabled), idle/failed (trigger checkpoint).
  let button: React.ReactNode;
  if (state === "passed") {
    if (isFinalPart) {
      if (nextModuleId) {
        button = (
          <Link
            href={`/learn/${nextModuleId}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0f0f0f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1f1f1f]"
          >
            Next module
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        );
      } else {
        button = (
          <button
            type="button"
            disabled
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-5 py-2.5 text-sm font-semibold text-[#6b7280]"
          >
            Course complete
          </button>
        );
      }
    } else {
      button = (
        <button
          type="button"
          onClick={onAdvance}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
        >
          Next part
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      );
    }
  } else if (state === "pending") {
    button = (
      <button
        type="button"
        disabled
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-5 py-2.5 text-sm font-semibold text-[#6b7280]"
      >
        Question in the mentor
      </button>
    );
  } else {
    button = (
      <button
        type="button"
        onClick={onTrigger}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#ffb300] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
      >
        {state === "failed" ? "Try the question again" : "Test your understanding"}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}
        >
          <Icon
            className={`h-5 w-5 ${state === "passed" ? "text-white" : "text-[#0f0f0f]"}`}
          />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[#0f0f0f]">{headline}</h3>
          <p className="mt-1 max-w-prose text-sm text-[#6b7280]">{subhead}</p>
        </div>
        {button}
      </div>
    </div>
  );
}

function ExplainableParagraph({
  children,
  concept,
}: {
  children: React.ReactNode;
  concept: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  function handleExplain() {
    const text = ref.current?.innerText?.trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent("nx:explain", {
        detail: { anchor: text, concept },
      }),
    );
  }

  return (
    <div className="group relative">
      <p
        ref={ref}
        className="text-[15px] leading-7 text-[#0f0f0f]"
      >
        {children}
      </p>
      <button
        type="button"
        onClick={handleExplain}
        title="Ask the mentor to explain this paragraph"
        aria-label="Explain this paragraph"
        className="absolute -right-2 top-1 hidden items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-2 py-1 text-[10px] font-medium text-[#6b7280] opacity-0 transition group-hover:flex group-hover:opacity-100 hover:border-[#ffb300] hover:text-[#0f0f0f]"
      >
        <HelpCircle className="h-3 w-3" />
        Explain this
      </button>
    </div>
  );
}

function EmptyLesson() {
  return (
    <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
      <p className="text-sm font-medium text-[#0f0f0f]">
        Lesson content in progress
      </p>
      <p className="mt-1 text-xs text-[#6b7280]">
        This module is seeded for the demo narrative. Return to the active
        module.
      </p>
    </div>
  );
}
