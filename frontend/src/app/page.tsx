import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Circle, Route, Sparkles, User } from "lucide-react";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { mockCanvas } from "@/lib/lms/mock-canvas";
import { DEMO_STUDENT } from "@/lib/demo-identity";
import { StreakCard } from "@/components/journey/streak-card";
import { MotivationStat } from "@/components/journey/motivation-stat";
import { ProactiveNudge } from "@/components/plan/proactive-nudge";
import { LiveGreeting } from "@/components/portal/live-greeting";

export default async function Home() {
  const [course, modules, assignments, lastScore] = await Promise.all([
    mockCanvas.getCurrentCourse(),
    mockCanvas.getModules(),
    mockCanvas.getAssignments({ from: new Date(Date.now() - 2 * 86400_000) }),
    mockCanvas.getLastQuizScore("sara-patel"),
  ]);

  const activeModule = modules.find((m) => m.status === "active") ?? modules[0];
  const nextDueAssignment = [...assignments]
    .filter((a) => !a.completed)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  const completedCount = modules.filter((m) => m.status === "completed").length;
  const progressPct = Math.round((completedCount / modules.length) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Nav />

      <main className="dot-bg flex-1 px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          {/* Greeting */}
          <div className="mb-10 flex items-center justify-between">
            <LiveGreeting firstName={DEMO_STUDENT.name.split(" ")[0]} />
            <div className="flex items-center gap-3">
              <StreakCard compact />
              <div className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f0f0f]">
                  <User className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-medium text-[#0f0f0f]">
                  {DEMO_STUDENT.name}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <ProactiveNudge variant="compact" />
          </div>

          {/* Hero card — continue learning */}
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="brand">
                    <Sparkles className="h-3 w-3" />
                    Continue where you left off
                  </Badge>
                  {nextDueAssignment && (
                    <Badge variant="outline">
                      Due {formatDueDate(nextDueAssignment.dueAt)}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
                    {course.title} · Module {activeModule.number}
                  </p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                    {activeModule.title}
                  </h2>
                  <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#6b7280]">
                    Read the chapter, test yourself at the checkpoints, and the
                    mentor will step in the moment your reasoning stalls.
                  </p>
                </div>
                <Link
                  href={`/learn/${activeModule.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ffb300] px-5 py-3 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
                >
                  Continue learning
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="hidden shrink-0 w-56 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                  Course progress
                </p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold text-[#0f0f0f]">
                    {progressPct}%
                  </span>
                  <span className="pb-1 text-xs text-[#6b7280]">complete</span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full bg-[#ffb300]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {lastScore && (
                  <p className="mt-4 text-[11px] leading-relaxed text-[#6b7280]">
                    Last quiz: <span className="font-semibold text-[#0f0f0f]">{lastScore.score}%</span> on {lastScore.concept}.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Quick nav row */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <NavTile
              href="/plan"
              icon={Route}
              label="My Week"
              desc="Agentic study plan for the next seven days."
            />
            <NavTile
              href="/journey"
              icon={Sparkles}
              label="My Journey"
              desc="Concept map of what you have mastered so far."
            />
          </div>

          <div className="mt-10">
            <MotivationStat
              percent={95}
              headline="95% of students who complete our program pass their final exam."
              subhead="Cohort data from previous Nexford runs · refreshed weekly"
              accent="amber"
            />
          </div>

          {/* Module list */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
              All modules
            </p>
            <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
              {modules.map((m, i) => (
                <Link
                  key={m.id}
                  href={`/learn/${m.id}`}
                  className={`flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#f9fafb] ${
                    i === 0 ? "" : "border-t border-[#e5e7eb]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {m.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-[#0f0f0f]" />
                    ) : m.status === "active" ? (
                      <Circle className="h-4 w-4 fill-[#ffb300] text-[#ffb300]" />
                    ) : (
                      <Circle className="h-4 w-4 text-[#e5e7eb]" />
                    )}
                    <span className="font-mono text-[11px] text-[#6b7280]">
                      {String(m.number).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-medium text-[#0f0f0f]">
                      {m.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                    <span>{m.estimatedMinutes} min</span>
                    {m.status === "active" && (
                      <Badge variant="brand" className="text-[10px]">
                        Continue
                      </Badge>
                    )}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#e5e7eb] bg-white py-6 text-center text-xs text-[#6b7280]">
        Nexford University · Intervention Intelligence Platform
      </footer>
    </div>
  );
}

function NavTile({
  href,
  icon: Icon,
  label,
  desc,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-[#e5e7eb] bg-white p-5 transition hover:border-[#0f0f0f]"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f9fafb] group-hover:bg-[#fefce8]">
          <Icon className="h-4 w-4 text-[#0f0f0f]" />
        </div>
        <span className="text-sm font-semibold text-[#0f0f0f]">{label}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#6b7280]">{desc}</p>
    </Link>
  );
}

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `${d.toLocaleDateString("en-US", { weekday: "short" })}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
