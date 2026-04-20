"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { formatConcept } from "@/components/teacher/types";
import { ExportToGradebookButton } from "@/components/teacher/export-to-gradebook-button";

interface RecentLog {
  role: string;
  content: string;
  createdAt: string;
}

interface StudentDetail {
  userId: string;
  totalSessions: number;
  lastActive: string | null;
  level: string;
  attempts: number;
  interventionCost: number;
  lastIntervention?: { type: string; at: string };
  evidence: string;
  bottleneck: string;
  misconception: string | null;
  profilerNotes: string | null;
  recentLogs: RecentLog[];
}

interface ConceptDetail {
  concept: string;
  summary: {
    totalStudents: number;
    weakCount: number;
    moderateCount: number;
    strongCount: number;
  };
  students: StudentDetail[];
}

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  weak: { label: "Weak", className: "bg-red-100 text-red-800" },
  moderate: { label: "Moderate", className: "bg-yellow-100 text-yellow-800" },
  strong: { label: "Strong", className: "bg-green-100 text-green-800" },
};

const INTERVENTION_LABEL: Record<string, string> = {
  direct_mode: "Direct-mode handoff",
  quiz_fail: "Quiz miss",
  topic_closed: "Topic closed",
};

export default function ConceptDrillDownPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = use(params);
  const [data, setData] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teacher/concept/${tag}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: ConceptDetail) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b7280] transition hover:text-[#0f0f0f]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Class Intelligence
          </Link>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                Concept Drill-Down
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                {formatConcept(tag)}
              </h1>
              {data && (
                <p className="mt-1 text-sm text-[#6b7280]">
                  {data.summary.totalStudents} student
                  {data.summary.totalStudents === 1 ? "" : "s"} engaged with
                  this concept · {data.summary.weakCount} weak ·{" "}
                  {data.summary.moderateCount} moderate ·{" "}
                  {data.summary.strongCount} strong
                </p>
              )}
            </div>
          </div>

          {loading && (
            <div className="mt-16 flex justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#0f0f0f]" />
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {data && data.students.length === 0 && (
            <div className="mt-12 rounded-xl border border-[#e5e7eb] bg-white px-6 py-10 text-center">
              <p className="text-sm text-[#6b7280]">
                No student has engaged with this concept yet.
              </p>
            </div>
          )}

          {data && data.students.length > 0 && (
            <div className="mt-8 space-y-4">
              {data.students.map((student) => {
                const badge = LEVEL_BADGE[student.level] ?? {
                  label: student.level,
                  className: "bg-gray-100 text-gray-800",
                };
                return (
                  <div
                    key={student.userId}
                    className="rounded-xl border border-[#e5e7eb] bg-white"
                  >
                    <div className="border-b border-[#f3f4f6] px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-xs text-[#6b7280]">
                            {student.userId.slice(0, 12)}…
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {student.attempts} attempt
                              {student.attempts !== 1 ? "s" : ""}
                            </Badge>
                            {student.interventionCost > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-[#fbbf24] bg-[#fef3c7] text-[#92400e]"
                              >
                                {student.interventionCost}× help
                              </Badge>
                            )}
                            {student.lastIntervention && (
                              <span className="text-[11px] text-[#6b7280]">
                                Last:{" "}
                                {INTERVENTION_LABEL[
                                  student.lastIntervention.type
                                ] ?? student.lastIntervention.type}
                              </span>
                            )}
                          </div>
                        </div>
                        <ExportToGradebookButton
                          studentId={student.userId}
                          conceptTag={tag}
                        />
                      </div>
                      {student.bottleneck && (
                        <p className="mt-3 text-sm leading-relaxed text-[#0f0f0f]">
                          <span className="font-medium text-[#6b7280]">
                            Diagnostic:{" "}
                          </span>
                          {student.bottleneck}
                        </p>
                      )}
                      {student.misconception && (
                        <p className="mt-2 text-sm leading-relaxed text-[#7f1d1d]">
                          <span className="font-medium">Misconception: </span>
                          {student.misconception}
                        </p>
                      )}
                    </div>

                    {student.recentLogs.length > 0 && (
                      <div className="px-5 py-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-[#6b7280]">
                          Recent transcript
                        </p>
                        <div className="mt-3 space-y-3">
                          {student.recentLogs
                            .slice()
                            .reverse()
                            .map((log, idx) => (
                              <div
                                key={`${log.createdAt}-${idx}`}
                                className={
                                  log.role === "student"
                                    ? "border-l-2 border-[#3b82f6] pl-3"
                                    : "border-l-2 border-[#a78bfa] pl-3"
                                }
                              >
                                <p className="text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">
                                  {log.role}
                                </p>
                                <p className="mt-0.5 text-sm text-[#0f0f0f]">
                                  {log.content.length > 220
                                    ? `${log.content.slice(0, 217)}…`
                                    : log.content}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
