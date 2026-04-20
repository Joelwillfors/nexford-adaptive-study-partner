"use client";

/**
 * /teacher/student/[id] — Per-student teacher drilldown.
 *
 * Fed by /api/teacher/student/[id]. Renders the same Bottlenecks data
 * the watchlist row sub-panel surfaces, but at full size and with room
 * to grow into Misconceptions + (future) Engagement timeline.
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Brain, Activity } from "lucide-react";
import { Nav } from "@/components/nav";
import { DEMO_STUDENT } from "@/lib/demo-identity";

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

export default function TeacherStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/teacher/student/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d: StudentDetail) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isDemoStudent = id === DEMO_STUDENT.id;
  const displayName = isDemoStudent ? DEMO_STUDENT.name : `${id.slice(0, 8)}…`;

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/teacher/watchlist"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b7280] transition hover:text-[#0f0f0f]"
          >
            <ArrowLeft className="h-3 w-3" />
            Student Watchlist
          </Link>

          {loading && (
            <div className="mt-16 flex justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#0f0f0f]" />
            </div>
          )}

          {error && !loading && (
            <div className="mt-16 rounded-xl border border-[#fde047] bg-[#fefce8] px-5 py-6 text-center">
              <h1 className="text-base font-semibold text-[#0f0f0f]">
                Couldn&apos;t load this student
              </h1>
              <p className="mt-2 text-sm text-[#6b7280]">{error}</p>
              <Link
                href="/teacher/watchlist"
                className="mt-4 inline-block text-xs font-medium text-[#0f0f0f] underline underline-offset-2"
              >
                Back to watchlist
              </Link>
            </div>
          )}

          {data && !loading && !error && (
            <>
              <Header displayName={displayName} data={data} />

              <BottlenecksSection data={data} />

              <MisconceptionsSection data={data} />

              <EngagementPlaceholder />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Header({
  displayName,
  data,
}: {
  displayName: string;
  data: StudentDetail;
}) {
  const levelColor =
    data.level === "weak"
      ? "#dc2626"
      : data.level === "moderate"
        ? "#f59e0b"
        : "#16a34a";
  const initials = displayName.slice(0, 2).toUpperCase();
  const ago = data.lastActive
    ? formatRelative(new Date(data.lastActive))
    : "no recorded activity";

  return (
    <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-white px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6]">
          <span className="text-sm font-mono font-semibold text-[#6b7280]">
            {initials}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
            Student Profile
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#0f0f0f]">
              {displayName}
            </h1>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white"
              style={{ backgroundColor: levelColor }}
            >
              {data.level}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#6b7280]">
            {data.sessions} session{data.sessions === 1 ? "" : "s"} · last
            active {ago} · {data.counts.total} concept
            {data.counts.total === 1 ? "" : "s"} tracked
          </p>
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <CountBadge label="Weak" value={data.counts.weak} color="#dc2626" />
          <CountBadge
            label="Moderate"
            value={data.counts.moderate}
            color="#f59e0b"
          />
          <CountBadge label="Strong" value={data.counts.strong} color="#16a34a" />
        </div>
      </div>
    </div>
  );
}

function CountBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <p
        className="text-xl font-bold leading-none"
        style={{ color }}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
        {label}
      </p>
    </div>
  );
}

function BottlenecksSection({ data }: { data: StudentDetail }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[#dc2626]" />
        <h2 className="text-lg font-semibold text-[#0f0f0f]">Bottlenecks</h2>
        <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[10px] font-semibold text-[#991b1b]">
          {data.weakConcepts.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#6b7280]">
        Every concept currently flagged weak in the Profiler&apos;s knowledge
        graph for this student. Click a concept to see how the rest of the
        cohort is doing on it.
      </p>

      {data.weakConcepts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#166534]">
            No bottlenecks — all green ahead.
          </p>
          <p className="mt-1 text-xs text-[#15803d]">
            This student has no concepts at the weak level right now.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {data.weakConcepts.map((c) => (
            <ConceptRow key={c.tag} concept={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConceptRow({
  concept,
}: {
  concept: StudentDetail["weakConcepts"][number];
}) {
  const lastSeen = concept.lastSeen
    ? formatRelative(new Date(concept.lastSeen))
    : "never";
  return (
    <Link
      href={`/teacher/concept/${concept.tag}`}
      className="group flex items-start gap-3 rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition hover:border-[#0f0f0f]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#0f0f0f] group-hover:text-[#92400e]">
            {concept.label}
          </span>
          <span className="rounded-full bg-[#fef2f2] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#991b1b]">
            Weak
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#6b7280]">
          {concept.attempts} attempt{concept.attempts === 1 ? "" : "s"} · last
          seen {lastSeen}
        </p>
        {concept.bottleneck && (
          <p className="mt-2 line-clamp-2 text-xs italic text-[#6b7280]">
            &ldquo;{concept.bottleneck}&rdquo;
          </p>
        )}
      </div>
      <span className="mt-1 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280] transition group-hover:text-[#0f0f0f]">
        Cohort view ›
      </span>
    </Link>
  );
}

function MisconceptionsSection({ data }: { data: StudentDetail }) {
  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-[#7c3aed]" />
        <h2 className="text-lg font-semibold text-[#0f0f0f]">
          Misconceptions
        </h2>
        <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[10px] font-semibold text-[#5b21b6]">
          {data.misconceptions.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#6b7280]">
        Structured wrong-model statements the Profiler captured during chat.
        These are the specific things the student believes that aren&apos;t
        true.
      </p>

      {data.misconceptions.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-white px-5 py-6 text-center">
          <p className="text-sm text-[#6b7280]">
            No structured misconceptions on record yet.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {data.misconceptions.map((m) => (
            <Link
              key={m.tag}
              href={`/teacher/concept/${m.tag}`}
              className="group block rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition hover:border-[#0f0f0f]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#0f0f0f] group-hover:text-[#5b21b6]">
                  {m.label}
                </span>
                {m.lastSeen && (
                  <span className="shrink-0 text-[10px] font-mono text-[#6b7280]">
                    {formatRelative(new Date(m.lastSeen))}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm italic text-[#6b7280]">
                &ldquo;{m.text}&rdquo;
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function EngagementPlaceholder() {
  return (
    <section className="mt-10 mb-12">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#6b7280]" />
        <h2 className="text-lg font-semibold text-[#0f0f0f]">Engagement</h2>
        <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-sm text-[#6b7280]">
        Session frequency, length trend, and intervention timeline. Wired off
        the same chat_logs feed the Profiler reads — surfacing here in a
        future iteration.
      </p>
    </section>
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
