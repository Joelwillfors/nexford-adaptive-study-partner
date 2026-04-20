"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizMessage as QuizMessageType } from "@/lib/ai/schemas";

type Confidence = "guessing" | "fairly_sure" | "certain";

export function QuizMessage({
  message,
  response,
  onAnswer,
}: {
  message: QuizMessageType;
  response?: { selectedIndex: number; correct: boolean };
  onAnswer: (selectedIndex: number, confidence: Confidence) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  const submitted = response !== undefined;

  function select(idx: number) {
    if (submitted) return;
    setPendingIdx(idx);
  }

  function commit(conf: Confidence) {
    if (submitted || pendingIdx === null) return;
    setConfidence(conf);
    onAnswer(pendingIdx, conf);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex justify-start"
    >
      <div className="w-full rounded-2xl border border-[#fde047] bg-[#fefce8] p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
            <Sparkles className="h-3 w-3 text-[#0f0f0f]" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
            {message.trigger === "checkpoint"
              ? "Checkpoint"
              : message.trigger === "confirmation"
                ? "Confirmation"
                : "Spaced Review"}
          </span>
          <span className="ml-auto text-[10px] text-[#92400e]">
            {message.concept_tag}
          </span>
        </div>

        <p className="text-sm font-medium leading-relaxed text-[#0f0f0f]">
          {message.question}
        </p>

        <div className="mt-4 space-y-2">
          {message.options.map((opt, idx) => {
            const isSelected = pendingIdx === idx;
            const isCorrect = response?.correct && response.selectedIndex === idx;
            const isWrong = response && !response.correct && response.selectedIndex === idx;
            const isRevealedCorrect =
              submitted && idx === message.correct_index;

            return (
              <button
                key={idx}
                onClick={() => select(idx)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                disabled={submitted}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                  !submitted && !isSelected && "border-[#e5e7eb] bg-white hover:border-[#0f0f0f]",
                  !submitted &&
                    isSelected &&
                    "border-[#0f0f0f] bg-[#0f0f0f] text-white",
                  isCorrect && "border-green-500 bg-green-50 text-green-900",
                  isWrong && "border-red-400 bg-red-50 text-red-900",
                  isRevealedCorrect &&
                    !isCorrect &&
                    "border-green-500 bg-green-50 text-green-900",
                  submitted && !isCorrect && !isWrong && !isRevealedCorrect && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    !submitted && !isSelected && "border-[#e5e7eb] text-[#6b7280]",
                    !submitted && isSelected && "border-white text-white",
                    isCorrect && "border-green-700 bg-green-700 text-white",
                    isWrong && "border-red-700 bg-red-700 text-white",
                    isRevealedCorrect && !isCorrect && "border-green-700 bg-green-700 text-white",
                  )}
                >
                  {isCorrect || isRevealedCorrect ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : isWrong ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    String.fromCharCode(65 + idx)
                  )}
                </span>
                <span className="flex-1 leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Confidence tap — appears only after a selection, before commit */}
        <AnimatePresence>
          {pendingIdx !== null && !submitted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
                How confident are you?
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ConfButton label="Guessing" onClick={() => commit("guessing")} />
                <ConfButton
                  label="Fairly sure"
                  onClick={() => commit("fairly_sure")}
                />
                <ConfButton label="Certain" onClick={() => commit("certain")} />
              </div>
              <p className="mt-2 text-[11px] italic text-[#92400e]/80">
                We track this to measure calibration — knowing what you know.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {submitted && message.explanation && (
          <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-white p-3 text-xs leading-relaxed text-[#6b7280]">
            {message.explanation}
          </div>
        )}

        {/* suppress unused */}
        <span className="hidden">{hoveredIdx}</span>
        <span className="hidden">{confidence}</span>
      </div>
    </motion.div>
  );
}

function ConfButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs font-medium text-[#0f0f0f] transition hover:border-[#0f0f0f] hover:bg-[#0f0f0f] hover:text-white"
    >
      {label}
    </button>
  );
}
