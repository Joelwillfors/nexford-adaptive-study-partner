"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/nav";
import { FEATURE_FLAGS } from "@/lib/flags";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import {
  buildConceptGroups,
  formatConcept,
  groupConceptsByModule,
} from "@/components/teacher/types";
import { ConceptModuleSection } from "@/components/teacher/concept-module-section";
import { HardEarnedMastery } from "@/components/teacher/hard-earned-mastery";
import { MetricCard, ChartIcon } from "@/components/teacher/ui";

export default function TeacherPage() {
  const { data, loading, error } = useDashboard();
  // Concept-level view of actionRequired. Memoized so the metric tile
  // and the list always render the same number — preventing the old
  // "Need Attention: 1 / 9 rows below" mismatch.
  const conceptGroups = useMemo(
    () => (data ? buildConceptGroups(data.actionRequired) : []),
    [data],
  );
  // Brief amber-ring flash when the user arrives at the Struggling
  // Concepts section via the "Need Attention" anchor link. Listening
  // for hashchange covers same-page re-navigations (the page does not
  // remount when the metric is clicked from the same route).
  // `expandSignal` is a monotonically increasing counter consumed by
  // every ConceptModuleSection — incrementing it forces all sections
  // open so the teacher sees what's stuck without an extra click.
  const [flashStruggling, setFlashStruggling] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);

  useEffect(() => {
    function checkHash() {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#struggling-concepts") {
        setFlashStruggling(true);
        setExpandSignal((n) => n + 1);
        window.setTimeout(() => setFlashStruggling(false), 1800);
      }
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
              Teacher Portal
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
              Class Intelligence
            </h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              How the cohort is moving — where they&apos;re stuck, what
              they&apos;re confusing, and which concepts need reinforcement.
            </p>
          </div>

          {loading && (
            <div className="mt-16 flex justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#0f0f0f]" />
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-xl border border-[#fde047] bg-[#fefce8] px-5 py-4 text-sm text-[#0f0f0f]">
              {error}
            </div>
          )}

          {data && (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard
                  label="Total Students"
                  value={data.summary.totalStudents}
                />
                <MetricCard
                  label="Active (24h)"
                  value={data.summary.activeRecently}
                  highlight
                />
                <MetricCard label="Strong" value={data.summary.strong} />
                <MetricCard
                  label="Concepts to Review"
                  value={conceptGroups.length}
                  danger
                  href={
                    conceptGroups.length > 0
                      ? "#struggling-concepts"
                      : undefined
                  }
                />
                <MetricCard
                  label="Reviews Sent (7d)"
                  value={data.summary.reviewsSent7d}
                />
              </div>

              {FEATURE_FLAGS.dropoutRisk && (
                <Link
                  href="/teacher/watchlist"
                  className="mt-6 flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition hover:bg-[#f9fafb]"
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                      Student Watchlist
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0f0f0f]">
                      {data.summary.atRiskCount ?? 0} student
                      {data.summary.atRiskCount === 1 ? "" : "s"} flagged at
                      risk of disengaging
                    </p>
                    <p className="mt-0.5 text-xs text-[#6b7280]">
                      Per-student dropout risk + factor breakdown.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#6b7280]" />
                </Link>
              )}

              {data.actionRequired.length > 0 && (
                <section
                  id="struggling-concepts"
                  className={`mt-12 scroll-mt-32 rounded-2xl transition ${
                    flashStruggling
                      ? "-mx-4 -my-4 bg-red-50/40 px-4 py-4 ring-2 ring-red-300"
                      : ""
                  }`}
                >
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[#0f0f0f]">
                      Struggling Concepts
                    </h2>
                    <p className="mt-0.5 text-sm text-[#6b7280]">
                      Grouped by module — open a module to see which concepts
                      students are stuck on, and why.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {groupConceptsByModule(conceptGroups).map((bucket) => (
                      <ConceptModuleSection
                        key={bucket.moduleId}
                        bucket={bucket}
                        defaultOpen={false}
                        forceOpenSignal={expandSignal}
                      />
                    ))}
                  </div>
                </section>
              )}

              {data.hardEarnedMastery && (
                <HardEarnedMastery rows={data.hardEarnedMastery} />
              )}

              {data.sharedMisconceptions.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-lg font-semibold text-[#0f0f0f]">
                    Shared Misconceptions
                  </h2>
                  <p className="mt-0.5 text-sm text-[#6b7280]">
                    Concepts where multiple students are repeatedly struggling.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {data.sharedMisconceptions.map((mc) => (
                      <div
                        key={mc.concept}
                        className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2"
                      >
                        <span className="text-sm font-medium text-[#0f0f0f]">
                          {formatConcept(mc.concept)}
                        </span>
                        <span className="rounded-full bg-[#ffb300] px-2 py-0.5 text-xs font-bold text-[#0f0f0f]">
                          {mc.studentCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.summary.totalStudents === 0 && (
                <div className="mt-20 flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e5e7eb] bg-white">
                    <ChartIcon className="h-7 w-7 text-[#6b7280]" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#0f0f0f]">
                    No interactions yet
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-[#6b7280]">
                    Once students start asking questions, their knowledge
                    graphs will populate this dashboard automatically.
                  </p>
                  <Link
                    href="/teacher/upload"
                    className="mt-6 rounded-full bg-[#ffb300] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
                  >
                    Upload course material
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
