"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Nav } from "@/components/nav";
import { FEATURE_FLAGS } from "@/lib/flags";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { MetricCard, LegendSwatch } from "@/components/teacher/ui";
import { StudentRiskRowCard } from "@/components/teacher/student-risk-row";

export default function TeacherWatchlistPage() {
  const { data, loading, error } = useDashboard();

  if (!FEATURE_FLAGS.dropoutRisk) {
    return (
      <div className="flex min-h-screen flex-col">
        <Nav />
        <main className="flex-1 bg-[#f9fafb] px-6 py-20">
          <div className="mx-auto max-w-xl rounded-xl border border-[#e5e7eb] bg-white px-6 py-8 text-center">
            <h1 className="text-lg font-semibold text-[#0f0f0f]">
              Student Watchlist
            </h1>
            <p className="mt-2 text-sm text-[#6b7280]">
              Dropout risk scoring is behind a feature flag. Enable
              <code className="mx-1 rounded bg-[#f3f4f6] px-1 py-0.5 text-xs">
                FEATURE_FLAGS.dropoutRisk
              </code>
              to view this page.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const sortedStudents = data
    ? [...data.allStudents].sort((a, b) => b.risk.score - a.risk.score)
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b7280] transition hover:text-[#0f0f0f]"
          >
            <ArrowLeft className="h-3 w-3" />
            Class Intelligence
          </Link>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                Teacher Portal
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                Student Watchlist
              </h1>
              <p className="mt-1 text-sm text-[#6b7280]">
                Per-student dropout risk — weighted from concept bottlenecks,
                engagement trend, and recency of activity.
              </p>
            </div>
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
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Total Students"
                  value={data.summary.totalStudents}
                />
                <MetricCard
                  label="Active (24h)"
                  value={data.summary.activeRecently}
                  highlight
                />
                <MetricCard
                  label="At Risk"
                  value={data.summary.atRiskCount ?? 0}
                  danger
                />
              </div>

              {sortedStudents.length > 0 ? (
                <section className="mt-12">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-[#0f0f0f]">
                        Sorted by risk
                      </h2>
                      <p className="mt-0.5 text-sm text-[#6b7280]">
                        Click a row to see the dominant factor and the reasons
                        behind the score.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                      <LegendSwatch color="#16a34a" label="Safe" />
                      <LegendSwatch color="#f59e0b" label="Watch" />
                      <LegendSwatch color="#dc2626" label="At risk" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {sortedStudents.map((s) => (
                      <StudentRiskRowCard key={s.userId} student={s} />
                    ))}
                  </div>
                </section>
              ) : (
                <div className="mt-16 flex flex-col items-center text-center">
                  <h3 className="text-base font-semibold text-[#0f0f0f]">
                    No students to show yet
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-[#6b7280]">
                    Once students start engaging with the mentor, their risk
                    snapshot will appear here.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
