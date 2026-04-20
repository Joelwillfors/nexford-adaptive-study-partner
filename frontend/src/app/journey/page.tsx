"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Target,
  TrendingDown,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { FEATURE_FLAGS } from "@/lib/flags";
import {
  MasteryChart,
  type JourneyConcept,
} from "@/components/journey/mastery-chart";
import { MotivationStat } from "@/components/journey/motivation-stat";
import { StreakCard } from "@/components/journey/streak-card";
import { moduleIdFor } from "@/lib/ai/concept-canon";
import { humanizeProfilerText } from "@/lib/journey/humanize";

interface JourneyData {
  courseId: string;
  studentId: string;
  overallLevel: "strong" | "moderate" | "weak" | "unknown";
  totalSessions: number;
  lastActive: string | null;
  concepts: JourneyConcept[];
  stats: {
    mastered: number;
    inProgress: number;
    struggling: number;
  };
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Not yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not yet";
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

type LevelFilter = "all" | "strong" | "moderate" | "weak";

const FILTER_LABEL: Record<Exclude<LevelFilter, "all">, string> = {
  strong: "Mastered",
  moderate: "In progress",
  weak: "Needs work",
};

export default function JourneyPage() {
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LevelFilter>("all");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/journey")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (!FEATURE_FLAGS.journey) {
    return (
      <div className="flex min-h-screen flex-col">
        <Nav />
        <main className="flex-1 bg-[#f9fafb] px-6 py-20">
          <div className="mx-auto max-w-xl rounded-xl border border-[#e5e7eb] bg-white px-6 py-8 text-center">
            <h1 className="text-lg font-semibold text-[#0f0f0f]">
              Your Learning Journey
            </h1>
            <p className="mt-2 text-sm text-[#6b7280]">
              Coming soon in the roadmap.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const hasData = data && data.concepts.length > 0;
  const conceptsWithDetail =
    data?.concepts.filter(
      (c) => c.bottleneck || c.reasoningStepFailed || c.misconception,
    ) ?? [];

  // Stat-card filter: clicking Mastered/In progress/Needs work narrows
  // both the chart and the DetailCard list to that level. "all" is the
  // default and renders the full set.
  const filteredConcepts =
    !data || filter === "all"
      ? data?.concepts ?? []
      : data.concepts.filter((c) => c.level === filter);
  const filteredDetail =
    filter === "all"
      ? conceptsWithDetail
      : conceptsWithDetail.filter((c) => c.level === filter);

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                Your learning
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                Your Learning Journey
              </h1>
              {data && (
                <p className="mt-1 text-sm text-[#6b7280]">
                  {data.totalSessions} session
                  {data.totalSessions === 1 ? "" : "s"} so far · Last visited{" "}
                  {formatRelative(data.lastActive).toLowerCase()}
                </p>
              )}
            </div>
            <Link
              href="/learn/module-3"
              className="rounded-full bg-[#ffb300] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
            >
              Continue learning
            </Link>
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
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.08 } },
                }}
                className="mt-8 grid gap-4 sm:grid-cols-3"
              >
                <StatCard
                  icon={
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  }
                  label="Mastered"
                  value={data.stats.mastered}
                  accent="green"
                  active={filter === "strong"}
                  onClick={() =>
                    setFilter((f) => (f === "strong" ? "all" : "strong"))
                  }
                />
                <StatCard
                  icon={
                    <Sparkles className="h-4 w-4 text-[#f59e0b]" />
                  }
                  label="In progress"
                  value={data.stats.inProgress}
                  accent="amber"
                  active={filter === "moderate"}
                  onClick={() =>
                    setFilter((f) => (f === "moderate" ? "all" : "moderate"))
                  }
                />
                <StatCard
                  icon={
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  }
                  label="Needs work"
                  value={data.stats.struggling}
                  accent="red"
                  active={filter === "weak"}
                  onClick={() =>
                    setFilter((f) => (f === "weak" ? "all" : "weak"))
                  }
                />
              </motion.div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
                <MotivationStat
                  percent={95}
                  headline="95% of students who complete our program pass their final exam."
                  subhead="Cohort data from previous Nexford runs · refreshed weekly"
                  accent="amber"
                />
                <StreakCard />
              </div>

              {hasData ? (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className="mt-10 rounded-xl border border-[#e5e7eb] bg-white p-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[#0f0f0f]">
                          Topics you&apos;ve practiced
                        </h2>
                        <p className="mt-0.5 text-sm text-[#6b7280]">
                          Hover a bar for detail. Green means it&apos;s
                          clicking for you.
                        </p>
                      </div>
                      {filter !== "all" && (
                        <button
                          type="button"
                          onClick={() => setFilter("all")}
                          className="rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1 text-[11px] font-medium text-[#0f0f0f] transition hover:border-[#0f0f0f]"
                        >
                          Showing {FILTER_LABEL[filter]} · clear
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                      <LegendSwatch color="#dc2626" label="Shaky" />
                      <LegendSwatch color="#f59e0b" label="Building" />
                      <LegendSwatch color="#16a34a" label="Solid" />
                    </div>
                  </div>
                  {filteredConcepts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[#e5e7eb] bg-[#f9fafb] px-4 py-6 text-center text-sm text-[#6b7280]">
                      Nothing in this bucket yet — try another filter.
                    </p>
                  ) : (
                    <MasteryChart
                      concepts={filteredConcepts}
                      onConceptClick={(c) => {
                        const mod = moduleIdFor(c.tag);
                        router.push(
                          `/learn/${mod}?focus=${encodeURIComponent(c.tag)}`,
                        );
                      }}
                    />
                  )}
                </motion.section>
              ) : (
                <EmptyState />
              )}

              {filteredDetail.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-lg font-semibold text-[#0f0f0f]">
                    What tripped you up — and how you got past it
                  </h2>
                  <p className="mt-0.5 text-sm text-[#6b7280]">
                    These are the moments your reasoning stalled and then
                    moved forward again. Open any card to revisit the same
                    idea with a fresh scenario — the mentor will meet you
                    exactly where you left off.
                  </p>
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.06 } },
                    }}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    {filteredDetail.map((c) => (
                      <DetailCard key={c.tag} concept={c} />
                    ))}
                  </motion.div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "green" | "amber" | "red";
  active?: boolean;
  onClick?: () => void;
}) {
  // When the card is the active filter we strengthen the border to the
  // accent's solid colour; otherwise we keep the soft tint that's been
  // here since the original design.
  const borderClass = active
    ? accent === "green"
      ? "border-green-600"
      : accent === "amber"
        ? "border-[#f59e0b]"
        : "border-red-600"
    : accent === "green"
      ? "border-green-200"
      : accent === "amber"
        ? "border-[#fde047]"
        : "border-red-200";

  const interactiveClass = onClick
    ? "cursor-pointer hover:border-[#0f0f0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f0f0f]"
    : "";

  const inner = (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-3xl font-bold text-[#0f0f0f]">{value}</p>
      {onClick && (
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-[#6b7280]">
          {active ? "Showing" : "Filter chart"}
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        variants={{
          hidden: { opacity: 0, y: 8 },
          visible: { opacity: 1, y: 0 },
        }}
        className={`rounded-xl border ${borderClass} bg-white px-5 py-5 text-left transition ${interactiveClass}`}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      className={`rounded-xl border ${borderClass} bg-white px-5 py-5`}
    >
      {inner}
    </motion.div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function DetailCard({ concept }: { concept: JourneyConcept }) {
  const moduleId = moduleIdFor(concept.tag);
  const focusHref = `/learn/${moduleId}?focus=${encodeURIComponent(concept.tag)}`;
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0 },
      }}
      className="rounded-xl border border-[#e5e7eb] bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0f0f0f]">{concept.name}</p>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {concept.attempts} attempt{concept.attempts === 1 ? "" : "s"} ·{" "}
            {formatRelative(concept.lastSeen).toLowerCase()}
          </p>
        </div>
        <LevelBadge level={concept.level} />
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {concept.bottleneck && (
          <DetailRow
            icon={<Target className="h-3.5 w-3.5 text-[#92400e]" />}
            label="What slowed you down"
            body={humanizeProfilerText("bottleneck", concept.bottleneck)}
          />
        )}
        {concept.reasoningStepFailed && (
          <DetailRow
            icon={<BookOpen className="h-3.5 w-3.5 text-[#92400e]" />}
            label="Tricky step"
            body={humanizeProfilerText(
              "reasoningStepFailed",
              concept.reasoningStepFailed,
            )}
          />
        )}
        {concept.misconception && (
          <DetailRow
            icon={<TrendingDown className="h-3.5 w-3.5 text-[#92400e]" />}
            label="Mix-up to fix"
            body={humanizeProfilerText("misconception", concept.misconception)}
          />
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Link
          href={focusHref}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0f0f0f] px-3 py-1.5 text-xs font-semibold text-[#ffb300] transition hover:bg-[#1f1f1f]"
        >
          Let&apos;s work on it
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}

function DetailRow({
  icon,
  label,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-widest text-[#92400e]">
          {label}
        </p>
        <p className="text-[13px] text-[#0f0f0f]">{body}</p>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: "strong" | "moderate" | "weak" }) {
  const cls =
    level === "strong"
      ? "bg-green-50 text-green-700 border-green-200"
      : level === "moderate"
        ? "bg-[#fefce8] text-[#92400e] border-[#fde047]"
        : "bg-red-50 text-red-700 border-red-200";
  const label =
    level === "strong"
      ? "Solid"
      : level === "moderate"
        ? "Building"
        : "Needs practice";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e5e7eb] bg-white">
        <Sparkles className="h-7 w-7 text-[#6b7280]" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#0f0f0f]">
        Your journey starts here
      </h3>
      <p className="mt-1 max-w-sm text-sm text-[#6b7280]">
        Open a lesson and chat with the mentor. As you work through ideas,
        they&apos;ll show up here, color-coded so you can see what&apos;s
        clicking and what still needs a second pass.
      </p>
      <Link
        href="/learn/module-3"
        className="mt-6 rounded-full bg-[#ffb300] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
      >
        Open a lesson
      </Link>
    </div>
  );
}
