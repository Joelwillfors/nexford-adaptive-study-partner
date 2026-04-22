"use client";

/**
 * /chat/plan — Planner Agent UI.
 *
 * Mon–Sun grid of recommended study slots. Each slot is a card with a
 * load badge, duration, kind label, and rationale string. Stagger
 * reveal on initial load so the plan feels generated, not pre-rendered.
 *
 * Move Earlier / Move Later buttons let the student tweak ordering — a
 * small thing UX-wise but it's the difference between "the system
 * decided for you" and "the system suggested, you decide". Drag-and-
 * drop is the obvious next step; not in scope for the demo.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  CalendarPlus,
  Download,
  GraduationCap,
  Dumbbell,
  Lightbulb,
  Loader2,
  RefreshCw,
  Users,
  Utensils,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { moduleIdFor } from "@/lib/ai/concept-canon";
import {
  eventsForDay,
  type LifeEvent,
  type LifeEventKind,
} from "@/lib/planner/life-events";
import {
  rulesAsLifeEvents,
  type AvailabilityRule,
} from "@/lib/calendar/availability-rules";
import {
  downloadIcs,
  slotToIcs,
  suggestSlotFilename,
  suggestWeekFilename,
  weekToIcs,
} from "@/lib/calendar/ics";
import {
  GRID_HEIGHT_PX,
  HOUR_HEIGHT,
  HOUR_TICKS,
  formatMinutes,
  layoutDay,
  minutesToHeight,
  minutesToTop,
  studyBlockHeightPx,
  type PlacedLifeBlock,
  type PlacedStudyBlock,
} from "@/lib/planner/day-schedule";
import { PlannerChat } from "@/components/plan/planner-chat";
import { ProactiveNudge } from "@/components/plan/proactive-nudge";
import {
  DAILY_LOAD_BUDGET,
  type StudyBand,
} from "@/lib/planner/study-band";

/** Concepts that produce a "Triggered by Socrates" sync line on review slots. */
const SOCRATIC_SYNC_CONCEPTS = new Set(["depreciation", "accrual_vs_cash"]);

type SlotKind = "new" | "review" | "practice" | "stretch";

interface PlanSlot {
  concept: string;
  conceptLabel: string;
  load: 1 | 2 | 3;
  durationMin: number;
  kind: SlotKind;
  rationale: string;
}

interface PlanDay {
  date: string;
  dayLabel: string;
  totalLoad: number;
  slots: PlanSlot[];
}

interface WeekPlan {
  studentId: string;
  weekStart: string;
  generatedAt: string;
  source: "live" | "fallback_seed";
  rationaleSummary: string;
  days: PlanDay[];
  /** Sum of `durationMin` across every slot. Anchored to Nexford's
   *  12–15h weekly success band — see `study-band.ts`. Required at
   *  this boundary because every consumer (Success Tip, Atlas chat,
   *  ICS export) expects a number. Cached/legacy responses are
   *  normalized to 0 in `normalizePlan` below. */
  weekTotalMin: number;
  band: StudyBand;
  /** Echoed back from the API so the calendar can render conversational
   *  busy windows (e.g. "Work · Wed 08:00–22:00") alongside the seed
   *  life events. Optional in the type because legacy responses /
   *  fallback paths may omit it. */
  availabilityRules?: AvailabilityRule[];
}

/**
 * Defensive normaliser. The current API always emits `weekTotalMin` and
 * `band`, but a cached fallback or an older browser tab might not. Re-derive
 * from slot data so the UI never crashes on a stale shape — keeps the demo
 * resilient to browser cache state.
 */
function normalizePlan(raw: WeekPlan): WeekPlan {
  const total =
    raw.weekTotalMin ??
    raw.days.reduce(
      (acc, d) => acc + d.slots.reduce((a, s) => a + s.durationMin, 0),
      0,
    );
  const band: StudyBand =
    raw.band ??
    (total < 600
      ? "risk"
      : total >= 1200
        ? "ceiling"
        : total > 900
          ? "stretch"
          : "on_track");
  return { ...raw, weekTotalMin: total, band };
}

const KIND_BADGE: Record<SlotKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  review: {
    label: "Review",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  practice: {
    label: "Practice",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  stretch: {
    label: "Stretch",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

const LOAD_DOTS: Record<1 | 2 | 3, string> = {
  1: "•",
  2: "••",
  3: "•••",
};

export default function PlanPage() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [syncingCanvas, setSyncingCanvas] = useState(false);
  // Per-page-load gate for Canvas-sourced lecture blocks. Resets on
  // every fresh navigation so the demo can show the calendar before
  // and after clicking "Import from Canvas".
  const [canvasImported, setCanvasImported] = useState(false);

  useEffect(() => {
    void fetchPlan();
  }, []);

  async function fetchPlan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WeekPlan = await res.json();
      setPlan(normalizePlan(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }

  async function importFromCanvas() {
    if (syncingCanvas) return;
    setSyncingCanvas(true);
    try {
      const res = await fetch("/api/lms/sync-canvas", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { lectures: number; assignments: number } = await res.json();
      setCanvasImported(true);
      toast.success(
        `Imported ${data.lectures} upcoming lecture${data.lectures === 1 ? "" : "s"} from Canvas`,
        {
          description: `${data.assignments} assignment${data.assignments === 1 ? "" : "s"} tagged · Mon and Fri lectures added to your week`,
        },
      );
    } catch (err) {
      toast.error("Canvas sync failed", {
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSyncingCanvas(false);
    }
  }

  function moveSlot(dayIdx: number, slotIdx: number, dir: -1 | 1) {
    if (!plan) return;
    const targetDayIdx = dayIdx + dir;
    if (targetDayIdx < 0 || targetDayIdx >= plan.days.length) return;
    const next = structuredClone(plan) as WeekPlan;
    const slot = next.days[dayIdx].slots[slotIdx];
    next.days[dayIdx].slots.splice(slotIdx, 1);
    next.days[dayIdx].totalLoad -= slot.load;
    next.days[targetDayIdx].slots.unshift(slot);
    next.days[targetDayIdx].totalLoad += slot.load;
    setPlan(normalizePlan(next));
  }

  /**
   * Insert a 5-minute review slot for the given concept on Thursday.
   * Used by the proactive nudge "Yes, build it" CTA so the demo can
   * physically show the reviewer landing in the planner.
   */
  function injectReviewSlot(concept: string, label: string) {
    if (!plan) return;
    const next = structuredClone(plan) as WeekPlan;
    const thursday = next.days.find((d) => d.dayLabel === "Thu");
    if (!thursday) {
      toast.error("Could not find Thursday in the current plan — skipped review slot.");
      return;
    }

    // Pull-forward dedup: if the planner already scheduled a review for
    // this concept elsewhere in the week, lift it out before we insert the
    // Thursday slot. One review per concept per week keeps the calendar
    // honest and makes the Socrates nudge a "consolidate early" decision,
    // not a duplicate.
    let pulledForward = false;
    for (const day of next.days) {
      if (day.dayLabel === "Thu") continue;
      const idx = day.slots.findIndex(
        (s) => s.kind === "review" && s.concept === concept,
      );
      if (idx >= 0) {
        const removed = day.slots.splice(idx, 1)[0];
        day.totalLoad -= removed.load;
        pulledForward = true;
      }
    }

    thursday.slots.unshift({
      concept,
      conceptLabel: label,
      load: 1,
      durationMin: 5,
      kind: "review",
      rationale: pulledForward
        ? `Pulled this review forward from later in the week — Socrates caught ${label} shaky today, so we consolidate while the trace is fresh.`
        : `Quick refresher you accepted from the Socrates nudge — keeps ${label} warm before the next module.`,
    });
    thursday.totalLoad += 1;
    setPlan(normalizePlan(next));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1 bg-[#f9fafb] px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-[#6b7280]">
                <Sparkles className="mr-1 inline h-3 w-3" />
                Adaptive Study Partner
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
                Your Week
              </h1>
              {plan && (
                <p className="mt-1 max-w-2xl text-sm text-[#6b7280]">
                  Plan for the week of{" "}
                  {new Date(plan.weekStart).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {plan.rationaleSummary}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={importFromCanvas}
                disabled={syncingCanvas}
                title="Re-pull lectures and assignments via the LMSProvider. Mock today; the same call hits Canvas live once an API key is configured."
                className="inline-flex min-w-[180px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#fde047] bg-[#fefce8] px-4 py-2 text-sm font-medium text-[#854d0e] transition hover:bg-[#fef3c7] disabled:opacity-60"
              >
                {syncingCanvas ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {syncingCanvas ? "Importing…" : "Import from Canvas"}
              </button>
              <button
                onClick={fetchPlan}
                disabled={loading}
                className="whitespace-nowrap rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#0f0f0f] transition hover:bg-[#f3f4f6] disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#0f0f0f]" />
                    Generating…
                  </span>
                ) : (
                  "Regenerate"
                )}
              </button>
            </div>
          </div>

          {loading && !plan && (
            <div className="mt-20 flex flex-col items-center text-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#e5e7eb] border-t-[#ffb300]" />
              <p className="mt-4 text-sm text-[#6b7280]">
                Reading your knowledge graph and balancing load…
              </p>
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {plan && (
            <>
              <ProactiveNudge
                onAccept={(concept, label) => injectReviewSlot(concept, label)}
              />

              <div className="mt-6 overflow-x-auto rounded-2xl border border-[#e5e7eb] bg-white">
                <div
                  className="flex min-w-[900px]"
                  style={{ height: GRID_HEIGHT_PX + 44 }}
                >
                  <HourRuler />
                  <div className="grid flex-1 grid-cols-7">
                    {plan.days.map((day, dayIdx) => (
                      <DayColumn
                        key={day.date}
                        day={day}
                        dayIdx={dayIdx}
                        isFirst={dayIdx === 0}
                        isLast={dayIdx === plan.days.length - 1}
                        onMove={moveSlot}
                        accepted={accepted}
                        availabilityRules={plan.availabilityRules ?? []}
                        weekStart={plan.weekStart}
                        canvasImported={canvasImported}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <SuccessBandTip
                weekTotalMin={plan.weekTotalMin}
                band={plan.band}
              />

              <div className="mt-6 flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-6 py-5">
                <div>
                  <p className="text-sm font-semibold text-[#0f0f0f]">
                    {accepted
                      ? "Plan accepted — see you tomorrow."
                      : "Looks good?"}
                  </p>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    {accepted
                      ? "Your daily nudges will line up with these slots."
                      : "Slots are proposed (dashed) until you accept. You can still rearrange days afterwards."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const ics = weekToIcs(plan);
                      downloadIcs(suggestWeekFilename(plan.weekStart), ics);
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-xs font-medium text-[#0f0f0f] transition hover:bg-[#f3f4f6]"
                    title="Download a .ics file with every accepted slot — opens in Apple / Google / Outlook calendar."
                  >
                    <Download className="h-3 w-3" />
                    Download week (.ics)
                  </button>
                  <button
                    onClick={() => setAccepted(true)}
                    disabled={accepted}
                    className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      accepted
                        ? "bg-green-100 text-green-800"
                        : "bg-[#ffb300] text-[#0f0f0f] hover:bg-[#e6a200]"
                    }`}
                  >
                    {accepted ? "Accepted" : "Accept Plan"}
                    {!accepted && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {plan && <PlannerChat plan={plan} setPlan={setPlan} />}
    </div>
  );
}

/**
 * HourRuler — left-most fixed-width strip with hour labels. Rendered
 * once outside the 7-day grid so the labels never duplicate; horizontal
 * gridlines inside each DayColumn line up with the same hour offsets.
 */
function HourRuler() {
  return (
    <div className="w-14 shrink-0 border-r border-[#e5e7eb] bg-[#fafafa]">
      {/* Spacer matches the day-column header (44px). */}
      <div className="h-11 border-b border-[#e5e7eb]" />
      <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
        {HOUR_TICKS.map((hour, idx) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex items-start justify-end pr-2"
            style={{ top: idx * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          >
            <span className="-mt-1.5 text-[10px] font-mono text-[#9ca3af]">
              {String(hour).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  dayIdx,
  isFirst,
  isLast,
  onMove,
  accepted,
  availabilityRules,
  weekStart,
  canvasImported,
}: {
  day: PlanDay;
  dayIdx: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dayIdx: number, slotIdx: number, dir: -1 | 1) => void;
  accepted: boolean;
  availabilityRules: AvailabilityRule[];
  weekStart: string;
  canvasImported: boolean;
}) {
  const date = new Date(day.date);
  const dayNum = date.getDate();
  // Merge two life-event sources: hardcoded Mon–Sun seed (lectures, gym,
  // family dinner) + persisted conversational rules ("Work · Wed
  // 08:00–22:00"). One layoutDay() call places study blocks around both.
  // Canvas-sourced events (lectures) are gated until the user clicks
  // "Import from Canvas" — see canvasImported state on the parent.
  const seedEvents = eventsForDay(day.dayLabel, { includeCanvas: canvasImported });
  const ruleEvents = rulesAsLifeEvents(
    availabilityRules,
    day.dayLabel as Parameters<typeof rulesAsLifeEvents>[1],
  );
  const lifeEvents: LifeEvent[] = [...seedEvents, ...ruleEvents];
  const { studyBlocks, lifeBlocks } = layoutDay(day.slots, lifeEvents);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: dayIdx * 0.06 }}
      className={`flex flex-col border-[#f3f4f6] ${dayIdx > 0 ? "border-l" : ""}`}
    >
      <div className="flex h-11 items-center justify-between border-b border-[#e5e7eb] bg-white px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0f0f0f]">
            {day.dayLabel}
          </span>
          <span className="text-xs text-[#6b7280]">{dayNum}</span>
        </div>
        <span
          className="text-[10px] font-mono text-[#6b7280]"
          title={`${day.totalLoad} cognitive load units`}
        >
          {day.totalLoad}/{DAILY_LOAD_BUDGET}
        </span>
      </div>

      {/* Time grid body. Absolute-positioned blocks; horizontal hour
          gridlines render behind. */}
      <div className="relative bg-white" style={{ height: GRID_HEIGHT_PX }}>
        {/* Hour gridlines */}
        {HOUR_TICKS.slice(0, -1).map((hour, idx) => (
          <div
            key={hour}
            className="pointer-events-none absolute inset-x-0 border-t border-[#f3f4f6]"
            style={{ top: idx * HOUR_HEIGHT }}
          />
        ))}

        {lifeBlocks.map((block, i) => (
          <LifeEventBlock key={`life-${i}`} block={block} />
        ))}

        {studyBlocks.length === 0 && lifeBlocks.length === 0 && (
          <div className="absolute inset-0 flex items-start justify-center pt-8">
            <p className="text-xs text-[#9ca3af]">Rest day</p>
          </div>
        )}

        {studyBlocks.map((block) => (
          <StudyBlock
            key={`study-${block.slotIdx}`}
            block={block}
            dayIdx={dayIdx}
            isFirst={isFirst}
            isLast={isLast}
            onMove={onMove}
            accepted={accepted}
            dayDate={day.date}
            weekStart={weekStart}
          />
        ))}
      </div>
    </motion.div>
  );
}

function LifeEventBlock({ block }: { block: PlacedLifeBlock }) {
  const meta = LIFE_EVENT_ICON[block.event.kind];
  const Icon = meta.icon;
  const top = minutesToTop(block.startMin);
  const height = minutesToHeight(block.endMin - block.startMin);
  const compact = height < 50;
  // Provenance — drives the small pill in the bottom-right of the card.
  // "canvas" → imported via the LMSProvider abstraction (lecture-shaped
  // events); "rule" → declared via the function-calling Planner chat;
  // "manual" / undefined → seed data with no specific provenance claim.
  const source = block.event.source ?? "manual";
  const provenance = PROVENANCE_PILL[source];
  return (
    <div
      className={`absolute inset-x-1 overflow-hidden rounded-md border ${meta.tint}`}
      style={{ top, height }}
      title={`${block.event.label} · ${block.event.time} · ${provenance.tooltip}`}
    >
      <div className="flex h-full flex-col gap-0.5 p-1.5">
        <div className="flex items-center gap-1">
          <Icon className="h-3 w-3 shrink-0" />
          <p className="truncate text-[11px] font-semibold leading-tight">
            {block.event.label}
          </p>
        </div>
        {!compact && (
          <p className="text-[10px] opacity-80">
            {formatMinutes(block.startMin)}–{formatMinutes(block.endMin)}
          </p>
        )}
        {!compact && provenance.label && (
          <span
            className={`mt-auto inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${provenance.className}`}
          >
            {provenance.label}
          </span>
        )}
      </div>
    </div>
  );
}

const PROVENANCE_PILL: Record<
  "canvas" | "manual" | "rule",
  { label: string | null; className: string; tooltip: string }
> = {
  canvas: {
    label: "via Canvas",
    className: "bg-white/80 text-[#1d4ed8]",
    tooltip: "Imported from Canvas via the LMSProvider abstraction",
  },
  rule: {
    label: "via chat",
    className: "bg-white/80 text-[#7c3aed]",
    tooltip: "Stored when you told the Planner Assistant about this commitment",
  },
  manual: {
    label: null,
    className: "",
    tooltip: "Synced from your life calendar",
  },
};

function StudyBlock({
  block,
  dayIdx,
  isFirst,
  isLast,
  onMove,
  accepted,
  dayDate,
  weekStart,
}: {
  block: PlacedStudyBlock;
  dayIdx: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dayIdx: number, slotIdx: number, dir: -1 | 1) => void;
  accepted: boolean;
  dayDate: string;
  weekStart: string;
}) {
  const { slot, slotIdx, startMin, endMin } = block;
  const top = minutesToTop(startMin);
  // Every study card renders at the same fixed visual height
  // (SLOT_VISUAL_MIN = 60 min). Keeps the calendar visually rhythmic
  // and guarantees room for badge + title + time + rationale + footer
  // even when the actual durationMin is short.
  const height = studyBlockHeightPx();
  const badge = KIND_BADGE[slot.kind];
  const moduleHref = `/learn/${moduleIdFor(slot.concept)}?focus=${encodeURIComponent(slot.concept)}`;
  const triggeredBySocrates =
    slot.kind === "review" && SOCRATIC_SYNC_CONCEPTS.has(slot.concept);
  // Size buckets are retained for safety (e.g. if SLOT_VISUAL_MIN is
  // ever lowered) but at 90px/hour all three thresholds pass for a
  // 60-min sleeve, so every card shows full content.
  const showRationale = height >= 70;
  const showSocraticTag = height >= 60 && triggeredBySocrates;
  const showMoveControls = height >= 45;
  const tooltip = `${slot.conceptLabel} · ${formatMinutes(startMin)}–${formatMinutes(endMin)} · ${slot.rationale}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`group absolute inset-x-1 overflow-hidden rounded-lg p-1.5 transition-colors ${
        accepted
          ? "border border-[#f3f4f6] bg-[#fafafa]"
          : "border-2 border-dashed border-[#fcd34d] bg-[#fefce8]"
      }`}
      style={{ top, height }}
      title={tooltip}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {!accepted && (
            <span className="shrink-0 rounded-full bg-[#fde68a] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#92400e]">
              Proposed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {accepted && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const ics = slotToIcs(
                  slot,
                  dayDate,
                  startMin,
                  endMin,
                  weekStart,
                );
                downloadIcs(suggestSlotFilename(slot, dayDate), ics);
              }}
              aria-label="Add this slot to your calendar (.ics)"
              title="Download a one-event .ics — opens in Apple / Google / Outlook"
              className="shrink-0 rounded-md p-0.5 text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#0f0f0f]"
            >
              <CalendarPlus className="h-3 w-3" />
            </button>
          )}
          <span
            className="shrink-0 font-mono text-[10px] text-[#6b7280]"
            title={`Cognitive load ${slot.load}/3`}
          >
            {LOAD_DOTS[slot.load]}
          </span>
        </div>
      </div>
      <Link
        href={moduleHref}
        className="mt-1 block truncate text-[12px] font-semibold leading-tight text-[#0f0f0f] hover:text-[#92400e]"
      >
        {slot.conceptLabel}
      </Link>
      {showRationale && (
        <p
          className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#6b7280]"
          title={slot.rationale}
        >
          {slot.rationale}
        </p>
      )}
      {showSocraticTag && (
        <div
          className="mt-1 flex items-start gap-1 rounded border border-[#fde047] bg-white/70 px-1 py-0.5"
          title="Socrates flagged this concept after a struggle in your last session"
        >
          <Sparkles className="mt-px h-2 w-2 shrink-0 text-[#92400e]" />
          <p className="text-[9px] leading-tight text-[#92400e]">
            Triggered by Socrates
          </p>
        </div>
      )}
      {showMoveControls && (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 flex justify-between gap-0.5 rounded bg-white/85 px-0.5 py-0.5 opacity-0 backdrop-blur-sm transition group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            onClick={() => onMove(dayIdx, slotIdx, -1)}
            disabled={isFirst}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] text-[#6b7280] transition hover:bg-[#f3f4f6] disabled:opacity-30"
            title="Move to previous day"
          >
            <ChevronLeft className="h-2.5 w-2.5" />
            Earlier
          </button>
          <button
            onClick={() => onMove(dayIdx, slotIdx, 1)}
            disabled={isLast}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] text-[#6b7280] transition hover:bg-[#f3f4f6] disabled:opacity-30"
            title="Move to next day"
          >
            Later
            <ChevronRight className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Subtle band-aware confirmation rendered between the calendar and the
 * Accept-Plan bar. Two jobs:
 *   - Tell the student how many hours the planner just blocked out.
 *   - Anchor that number to Nexford's "12–15 dedicated learning hours"
 *     guidance so the system feels accountable to the school's own
 *     pedagogy, not to a number the AI made up.
 *
 * Styling kept deliberately quiet (muted yellow) so it reads as a tip,
 * not an alert. Off-band weeks (risk / stretch / ceiling) get an honest
 * sentence about what's happening; the on-track copy is the reassurance
 * the brief asked for.
 */
function SuccessBandTip({
  weekTotalMin,
  band,
}: {
  weekTotalMin: number;
  band: StudyBand;
}) {
  const hours = (weekTotalMin / 60).toFixed(1).replace(/\.0$/, "");
  const message = (() => {
    switch (band) {
      case "stretch":
        return `${hours} hours blocked this week — above Nexford's 12–15h success band. That's a stretch week; protect your recovery time.`;
      case "ceiling":
        return `${hours} hours blocked — at the 20-hour ceiling. The planner won't add more; this is the sustainable maximum for a study week.`;
      case "risk":
        return `${hours} hours blocked — under Nexford's 10-hour floor. Tell Atlas what changed and we'll find more time.`;
      case "on_track":
      default:
        return `${hours} hours blocked this week — Nexford's most successful learners follow a structured schedule of 12–15 dedicated learning hours per week, so you're on track for success.`;
    }
  })();
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-5 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#b45309]" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#92400e]">
          Success Tip
        </p>
        <p className="mt-0.5 text-sm text-[#78350f]">{message}</p>
      </div>
    </div>
  );
}

const LIFE_EVENT_ICON: Record<
  LifeEventKind,
  { icon: typeof GraduationCap; tint: string; label: string }
> = {
  lecture: {
    icon: GraduationCap,
    tint: "text-[#1d4ed8] bg-[#dbeafe] border-[#bfdbfe]",
    label: "Lecture",
  },
  fitness: {
    icon: Dumbbell,
    tint: "text-[#15803d] bg-[#dcfce7] border-[#bbf7d0]",
    label: "Fitness",
  },
  social: {
    icon: Utensils,
    tint: "text-[#b45309] bg-[#fef3c7] border-[#fde68a]",
    label: "Social",
  },
  work: {
    icon: Users,
    tint: "text-[#7c3aed] bg-[#ede9fe] border-[#ddd6fe]",
    label: "Work",
  },
};

