"use client";

import { useEffect, useState } from "react";
import { ChevronIcon } from "./ui";
import { ConceptCard } from "./concept-card";
import type { ConceptModuleBucket } from "./types";

/**
 * Collapsible per-module bucket of struggling concepts. Used by the
 * teacher Class Intelligence page to roll up the flat concept list into
 * scannable curriculum-aware sections. Today (one seeded module)
 * collapses to a single section; the same code path fans out when
 * `CONCEPT_TO_MODULE` learns about more modules.
 *
 * `defaultOpen` only seeds the initial mount state. `forceOpenSignal`
 * is a parent-driven trigger (typically a counter) that opens this
 * section whenever it changes — used by the teacher dashboard to
 * auto-expand all modules when the user arrives via the
 * "Concepts to Review" metric card. The user can still collapse
 * manually after that.
 */
export function ConceptModuleSection({
  bucket,
  defaultOpen,
  forceOpenSignal,
}: {
  bucket: ConceptModuleBucket;
  defaultOpen: boolean;
  forceOpenSignal?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpenSignal !== undefined && forceOpenSignal > 0) {
      setOpen(true);
    }
  }, [forceOpenSignal]);
  const conceptCount = bucket.groups.length;
  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[#f9fafb]"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
            Module
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#0f0f0f]">
            {bucket.moduleTitle}
          </p>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {conceptCount} concept{conceptCount === 1 ? "" : "s"} stuck ·{" "}
            {bucket.totalStuck} student-attempt
            {bucket.totalStuck === 1 ? "" : "s"}
          </p>
        </div>
        <ChevronIcon
          className={`h-4 w-4 shrink-0 text-[#6b7280] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#e5e7eb] bg-[#f9fafb] px-3 py-3">
          {bucket.groups.map((group, idx) => (
            <ConceptCard key={group.concept} group={group} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
