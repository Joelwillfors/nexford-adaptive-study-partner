"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatConcept,
  getDominantBottleneck,
  type ConceptGroup,
} from "./types";
import { ChevronIcon } from "./ui";

export function ConceptCard({
  group,
  rank,
}: {
  group: ConceptGroup;
  rank: number;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const totalAttempts = group.students.reduce((a, s) => a + s.attempts, 0);
  const avgAttempts = (totalAttempts / group.students.length).toFixed(1);

  function sendReview(e: React.MouseEvent) {
    e.stopPropagation();
    setSent(true);
    toast.success(
      `Review material queued for ${group.students.length} students`,
      {
        description: `${formatConcept(group.concept)} — targeted prompt + 10-min recap video will be delivered tonight at 6pm local.`,
      },
    );
  }

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#f9fafb]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fefce8] border border-[#fde047] text-xs font-bold text-[#0f0f0f]">
            {rank}
          </span>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#0f0f0f]">
                {formatConcept(group.concept)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {group.students.length} stuck
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                avg {avgAttempts} attempts
              </Badge>
            </div>
            <span className="text-xs text-[#6b7280]">
              Dominant failure: {getDominantBottleneck(group)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sendReview}
            disabled={sent}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              sent
                ? "border border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]"
                : "bg-[#0f0f0f] text-white hover:bg-[#1f1f1f]"
            }`}
          >
            {sent ? "Sent" : "Send review"}
          </button>
          <ChevronIcon
            className={`h-4 w-4 text-[#6b7280] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-[#e5e7eb]">
          <div className="divide-y divide-[#f3f4f6]">
            {group.students.map((s) => (
              <div
                key={s.userId}
                className="flex items-start gap-4 px-5 py-4"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6]">
                  <span className="text-xs font-mono font-medium text-[#6b7280]">
                    {s.userId.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-[#6b7280]">
                    {s.userId.slice(0, 12)}…
                    <span className="ml-2 font-sans font-normal">
                      · {s.attempts} attempt{s.attempts !== 1 ? "s" : ""}
                    </span>
                  </p>
                  {s.bottleneck && (
                    <p className="mt-1 text-sm text-[#0f0f0f] leading-relaxed">
                      {s.bottleneck}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link
            href={`/teacher/concept/${group.concept}`}
            className="flex items-center justify-between border-t border-[#f3f4f6] bg-[#f9fafb] px-5 py-3 text-xs font-medium text-[#0f0f0f] transition hover:bg-[#f3f4f6]"
          >
            <span>View full student logs and chat history</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
