"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { DEMO_STUDENT } from "@/lib/demo-identity";
import { formatConcept, type StudentRiskRow } from "./types";
import { ChevronIcon } from "./ui";
import type { RiskReason } from "@/lib/risk";

interface StudentDetail {
  studentId: string;
  level: string;
  sessions: number;
  lastActive: string | null;
  counts: { weak: number; moderate: number; strong: number; total: number };
  weakConcepts: Array<{
    tag: string;
    label: string;
    attempts: number;
    lastSeen: string | null;
    bottleneck?: string;
    misconception?: string;
  }>;
  misconceptions: Array<{
    tag: string;
    label: string;
    text: string;
    lastSeen: string | null;
  }>;
}

const FACTOR_DEFINITIONS = {
  bottleneckFrequency:
    "How many core concepts the student is currently failing in the Profiler's knowledge graph.",
  sessionLengthTrend:
    "Frequency and length of recent study sessions, normalised against this cohort's median.",
  daysSinceLastSession:
    "Days since the student's last active learning session — recency dominates the dropout signal.",
} as const;

const FACTOR_LABEL = {
  bottleneckFrequency: "Bottlenecks",
  sessionLengthTrend: "Engagement",
  daysSinceLastSession: "Recency",
} as const;

export function StudentRiskRowCard({ student }: { student: StudentRiskRow }) {
  const [open, setOpen] = useState(false);
  // Second-level drilldown — clicking the "Bottlenecks" factor row
  // lazy-fetches the full per-student knowledge graph and renders every
  // weak concept (not just the top-3 chips above). Cached on the row so
  // collapsing and reopening doesn't refetch.
  const [bottlenecksOpen, setBottlenecksOpen] = useState(false);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const isDemoStudent = student.userId === DEMO_STUDENT.id;
  const displayName = isDemoStudent
    ? DEMO_STUDENT.name
    : `${student.userId.slice(0, 8)}…`;

  async function toggleBottlenecks() {
    const next = !bottlenecksOpen;
    setBottlenecksOpen(next);
    if (!next || detail || detailLoading) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(
        `/api/teacher/student/${encodeURIComponent(student.userId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: StudentDetail = await res.json();
      setDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setDetailLoading(false);
    }
  }

  const bandColor =
    student.risk.band === "red"
      ? "#dc2626"
      : student.risk.band === "yellow"
        ? "#f59e0b"
        : "#16a34a";
  const bandLabel =
    student.risk.band === "red"
      ? "At risk"
      : student.risk.band === "yellow"
        ? "Watch"
        : "Safe";

  const factorsData = (
    [
      "bottleneckFrequency",
      "sessionLengthTrend",
      "daysSinceLastSession",
    ] as const
  ).map((key) => ({
    key,
    label: FACTOR_LABEL[key],
    definition: FACTOR_DEFINITIONS[key],
    value: student.risk.factors[key],
  }));

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[#f9fafb]"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6]">
          <span className="text-xs font-mono font-medium text-[#6b7280]">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0f0f0f]">
              {displayName}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white"
              style={{ backgroundColor: bandColor }}
            >
              {bandLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {student.sessions} session{student.sessions === 1 ? "" : "s"} ·{" "}
            {student.conceptCount} concept
            {student.conceptCount === 1 ? "" : "s"}
            {student.level && ` · ${student.level}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-40">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round(student.risk.score * 100)}%`,
                  backgroundColor: bandColor,
                }}
              />
            </div>
            <p className="mt-1 text-right text-[10px] font-mono text-[#6b7280]">
              {Math.round(student.risk.score * 100)} / 100
            </p>
          </div>
          <ChevronIcon
            className={`h-4 w-4 text-[#6b7280] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {student.topWeakConcepts.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1 px-5 pb-3 pl-[60px]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
            Weakest
          </span>
          {student.topWeakConcepts.map((tag) => (
            <Link
              key={tag}
              href={`/teacher/concept/${tag}`}
              className="rounded-full border border-[#fde047] bg-[#fefce8] px-2 py-0.5 text-[10px] font-medium text-[#92400e] transition hover:bg-[#fef3c7]"
            >
              {formatConcept(tag)}
            </Link>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-[#e5e7eb] px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                Why this score
              </p>
              {student.risk.reasons.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm text-[#0f0f0f]">
                  {student.risk.reasons.map((r, i) => (
                    <ReasonRow key={i} reason={r} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#6b7280]">
                  No elevated factors — this student is on track.
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                Factor breakdown
              </p>
              <div className="mt-2 space-y-2.5">
                {factorsData.map((f) => (
                  <FactorRow
                    key={f.key}
                    label={f.label}
                    definition={f.definition}
                    value={f.value}
                    expandable={f.key === "bottleneckFrequency"}
                    expanded={
                      f.key === "bottleneckFrequency" && bottlenecksOpen
                    }
                    onToggle={
                      f.key === "bottleneckFrequency"
                        ? toggleBottlenecks
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {bottlenecksOpen && (
            <BottleneckPanel
              userId={student.userId}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              shownTagsAbove={student.topWeakConcepts}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline sub-panel under the Bottlenecks factor row. Lists every weak
 * concept for the student (not just the top-3 chips already shown
 * above) and offers a "See full profile" jump-off into the dedicated
 * /teacher/student/[id] page. Loaded lazily on first open.
 */
function BottleneckPanel({
  userId,
  detail,
  loading,
  error,
  shownTagsAbove,
}: {
  userId: string;
  detail: StudentDetail | null;
  loading: boolean;
  error: string | null;
  shownTagsAbove: string[];
}) {
  return (
    <div className="mt-4 rounded-lg border border-[#fde047] bg-[#fefce8] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
          All weak concepts
        </p>
        <Link
          href={`/teacher/student/${userId}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#92400e] transition hover:text-[#0f0f0f]"
        >
          See full profile
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="mt-3 flex justify-center py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fde047] border-t-[#92400e]" />
        </div>
      )}

      {error && !loading && (
        <p className="mt-2 text-xs text-[#991b1b]">
          Couldn&apos;t load concept list — {error}
        </p>
      )}

      {detail && !loading && !error && (
        <BottleneckList detail={detail} shownTagsAbove={shownTagsAbove} />
      )}
    </div>
  );
}

function BottleneckList({
  detail,
  shownTagsAbove,
}: {
  detail: StudentDetail;
  shownTagsAbove: string[];
}) {
  if (detail.weakConcepts.length === 0) {
    return (
      <p className="mt-2 text-xs text-[#92400e]">
        No weak concepts on record — this student&apos;s bottleneck factor is
        derived from other Profiler signals.
      </p>
    );
  }

  const seen = new Set(shownTagsAbove);
  const additional = detail.weakConcepts.filter((c) => !seen.has(c.tag));
  const allShownAlready = additional.length === 0;

  return (
    <>
      <ul className="mt-2 space-y-1">
        {detail.weakConcepts.map((c) => {
          const lastSeen = c.lastSeen
            ? formatRelative(new Date(c.lastSeen))
            : "never";
          return (
            <li key={c.tag}>
              <Link
                href={`/teacher/concept/${c.tag}`}
                className="group flex items-center justify-between gap-2 rounded-md border border-transparent bg-white px-2.5 py-1.5 transition hover:border-[#fde047]"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-xs font-medium text-[#0f0f0f] group-hover:text-[#92400e]">
                    {c.label}
                  </span>
                  <span className="shrink-0 text-[10px] font-mono text-[#6b7280]">
                    · {c.attempts} attempt{c.attempts === 1 ? "" : "s"}
                    {" · "}
                    {lastSeen}
                  </span>
                </span>
                <ChevronRight className="h-3 w-3 shrink-0 text-[#9ca3af] group-hover:text-[#92400e]" />
              </Link>
            </li>
          );
        })}
      </ul>
      {allShownAlready && (
        <p className="mt-2 text-[10px] text-[#92400e]">
          The chips above already covered all of them.
        </p>
      )}
    </>
  );
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo}mo ago`;
}

function ReasonRow({ reason }: { reason: RiskReason }) {
  return (
    <li className="group relative flex items-start gap-1.5">
      <span className="mt-[6px] inline-block h-1 w-1 shrink-0 rounded-full bg-[#0f0f0f]" />
      <span className="flex-1 text-sm text-[#0f0f0f]">{reason.text}</span>
      <button
        type="button"
        aria-label="Why this reason?"
        tabIndex={0}
        className="mt-0.5 shrink-0 text-[#9ca3af] transition hover:text-[#0f0f0f] focus:outline-none focus-visible:text-[#0f0f0f]"
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-[#e5e7eb] bg-[#0f0f0f] px-2.5 py-2 text-[11px] leading-snug text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {reason.tooltip}
      </div>
    </li>
  );
}

function FactorRow({
  label,
  definition,
  value,
  expandable,
  expanded,
  onToggle,
}: {
  label: string;
  definition: string;
  value: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.67 ? "#dc2626" : value >= 0.34 ? "#f59e0b" : "#16a34a";

  const labelCell = (
    <div className="group relative flex items-center gap-1.5">
      <span className="text-xs font-medium text-[#0f0f0f]">{label}</span>
      <span
        aria-label={`What does ${label} mean?`}
        className="text-[#9ca3af] transition group-hover:text-[#0f0f0f]"
      >
        <HelpCircle className="h-3 w-3" />
      </span>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-[#e5e7eb] bg-[#0f0f0f] px-2.5 py-2 text-[11px] leading-snug text-white opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {definition}
      </div>
      {expandable && (
        <span className="ml-1 text-[#92400e]">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
      )}
    </div>
  );

  const barCell = (
    <>
      <div className="h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-right text-[11px] font-mono text-[#6b7280]">
        {pct}%
      </span>
    </>
  );

  if (expandable && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!!expanded}
        title={
          expanded ? "Hide weak concept list" : "Show every weak concept"
        }
        className="grid w-full grid-cols-[120px_1fr_36px] items-center gap-3 rounded-md text-left transition hover:bg-[#fefce8]"
      >
        {labelCell}
        {barCell}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[120px_1fr_36px] items-center gap-3">
      {labelCell}
      {barCell}
    </div>
  );
}
