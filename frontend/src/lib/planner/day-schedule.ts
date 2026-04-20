/**
 * Day schedule layout — purely client-side time-grid placement for the
 * /plan calendar view.
 *
 * The Planner Agent currently emits ordered study slots with a
 * duration but no startTime. To render a real calendar we need to
 * pick a clock position for each slot and each life event. We compute
 * those positions deterministically from a fixed study window
 * (08:00-22:00) and the day's life events, using a simple greedy
 * first-fit algorithm: each study slot lands in the earliest free
 * interval big enough to hold it (plus a small buffer). If nothing
 * fits, the slot overflows at the end of the last free interval —
 * acceptable for the demo because the planner's daily budget is
 * already calibrated to fit.
 *
 * Why client-side: the demo doesn't need persisted start times, and
 * keeping layout reactive means features like the chat-driven move
 * (`PlannerChat`) only have to update the slot list, not the times.
 */

import type { LifeEvent } from "./life-events";
import type { PlanSlot } from "./types";

export const DAY_START_MIN = 8 * 60; // 08:00
export const DAY_END_MIN = 22 * 60; // 22:00
// 110px / hour. With a 14-hour window the grid is 1540px tall — taller
// than 90 but the extra 20px/hour gives 60-min study sleeves enough
// room for badge + title + 2-line rationale + Socratic-sync footer
// without clipping. The hover-only Earlier/Later overlay sits on top
// of the bottom edge so it doesn't compete for vertical space.
export const HOUR_HEIGHT = 110;

/**
 * Visual height (in minutes) for every study block on the grid.
 *
 * The planner emits short slot durations (12-30 min). At 90px/hour that
 * leaves 18-45px of card real-estate — too cramped for the badge,
 * concept name, time, rationale, and Socratic-sync footer to coexist.
 *
 * For the demo we render every study block as a 60-min "sleeve" so the
 * card always has room for content, while the actual durationMin is
 * still surfaced as a time range inside the card body. The model side
 * (planner agent, load math) is unaffected.
 */
export const SLOT_VISUAL_MIN = 60;

/**
 * Curated anchor start times for study slots. Each day's slots get
 * placed at the first unused anchor whose 60-min sleeve doesn't overlap
 * a life event. Picking from this fixed list (instead of computing
 * positions from slack) gives the calendar a stable, recognisable
 * rhythm — students see the same wall-clock cadence every day rather
 * than a different algorithmic pattern per day.
 */
const STUDY_ANCHORS: ReadonlyArray<number> = [
  9 * 60,         // 09:00 — morning warm-up
  11 * 60 + 30,   // 11:30 — late morning
  13 * 60 + 30,   // 13:30 — after lunch
  16 * 60,        // 16:00 — afternoon focus
  19 * 60,        // 19:00 — early evening
  20 * 60 + 30,   // 20:30 — late evening
];

export interface PlacedStudyBlock {
  slot: PlanSlot;
  /** Original index in the day's slots[] — needed to drive moveSlot. */
  slotIdx: number;
  startMin: number;
  endMin: number;
}

export interface PlacedLifeBlock {
  event: LifeEvent;
  startMin: number;
  endMin: number;
}

export interface DayLayout {
  studyBlocks: PlacedStudyBlock[];
  lifeBlocks: PlacedLifeBlock[];
}

interface Interval {
  start: number;
  end: number;
}

/** Parse "9:00 - 11:00" into minutes since midnight. */
export function parseLifeEventWindow(
  time: string,
): { startMin: number; endMin: number } | null {
  const m = time.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const endMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

/** Format minutes since midnight as "HH:MM" (24h). */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute placement for a single day. Pure function — same input,
 * same output, so React renders are stable.
 */
export function layoutDay(
  slots: PlanSlot[],
  lifeEvents: LifeEvent[],
): DayLayout {
  // 1. Place life events first (they're fixed).
  const lifeBlocks: PlacedLifeBlock[] = [];
  for (const event of lifeEvents) {
    const window = parseLifeEventWindow(event.time);
    if (!window) continue;
    // Clamp to the visible study window so off-grid events stay
    // off-grid rather than spilling into negative coordinates.
    const startMin = Math.max(window.startMin, DAY_START_MIN);
    const endMin = Math.min(window.endMin, DAY_END_MIN);
    if (endMin <= startMin) continue;
    lifeBlocks.push({ event, startMin, endMin });
  }
  lifeBlocks.sort((a, b) => a.startMin - b.startMin);

  // 2. Compute free intervals: study window minus life blocks.
  const free: Interval[] = computeFreeIntervals(
    DAY_START_MIN,
    DAY_END_MIN,
    lifeBlocks.map((b) => ({ start: b.startMin, end: b.endMin })),
  );

  // 3. Anchor placement: pick from a curated list of clock-friendly
  //    start times (09:00, 11:30, 13:30, 16:00, 19:00, 20:30). Each
  //    slot consumes the first unused anchor whose 60-min sleeve fits
  //    inside a free interval (i.e. doesn't overlap a life event). If
  //    a day's slot count exceeds the anchor list, fall back to the
  //    next available 15-min-snapped hole after the last placed slot.
  //
  //    Why 60-min sleeves: every study card needs the same visual area
  //    to render its content; SLOT_VISUAL_MIN drives both placement
  //    collisions here and the rendered height in StudyBlock.
  const studyBlocks: PlacedStudyBlock[] = [];
  const usedAnchors = new Set<number>();

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    let chosen: number | null = null;

    for (const anchor of STUDY_ANCHORS) {
      if (usedAnchors.has(anchor)) continue;
      if (fitsAtAnchor(anchor, SLOT_VISUAL_MIN, free)) {
        chosen = anchor;
        break;
      }
    }

    if (chosen === null) {
      // Fallback for overflow days: drop the slot into the next free
      // 15-min-snapped 60-min hole after the latest placed slot.
      const lastEnd =
        studyBlocks.length > 0
          ? studyBlocks[studyBlocks.length - 1].endMin
          : DAY_START_MIN;
      chosen = nextFreeHole(lastEnd, SLOT_VISUAL_MIN, free);
    }

    if (chosen === null) continue; // truly no room — drop from view

    usedAnchors.add(chosen);
    studyBlocks.push({
      slot,
      slotIdx,
      startMin: chosen,
      endMin: chosen + slot.durationMin,
    });
  }

  studyBlocks.sort((a, b) => a.startMin - b.startMin);

  return { studyBlocks, lifeBlocks };
}

/** True if a `visualMin` window starting at `startMin` fits entirely
 *  within one of the free intervals and the visible day window. */
function fitsAtAnchor(
  startMin: number,
  visualMin: number,
  free: Interval[],
): boolean {
  const endMin = startMin + visualMin;
  if (endMin > DAY_END_MIN) return false;
  return free.some((i) => startMin >= i.start && endMin <= i.end);
}

/** Earliest 15-min-snapped start at or after `after` that fits a
 *  `visualMin`-wide window inside one of `free`. Returns null if none. */
function nextFreeHole(
  after: number,
  visualMin: number,
  free: Interval[],
): number | null {
  for (const interval of free) {
    if (interval.end < after + visualMin) continue;
    const candidate = Math.max(interval.start, after);
    const snapped = Math.ceil(candidate / 15) * 15;
    if (snapped + visualMin <= interval.end) return snapped;
  }
  return null;
}

function computeFreeIntervals(
  windowStart: number,
  windowEnd: number,
  busy: Interval[],
): Interval[] {
  if (busy.length === 0) return [{ start: windowStart, end: windowEnd }];

  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = windowStart;
  for (const b of sorted) {
    const start = Math.max(b.start, windowStart);
    const end = Math.min(b.end, windowEnd);
    if (start > cursor) {
      free.push({ start: cursor, end: start });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < windowEnd) {
    free.push({ start: cursor, end: windowEnd });
  }
  return free;
}

/** Total visible height in pixels, used by DayColumn body. */
export const GRID_HEIGHT_PX =
  ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_HEIGHT;

/** Convert a minute offset into a top px position inside the grid. */
export function minutesToTop(min: number): number {
  return ((min - DAY_START_MIN) / 60) * HOUR_HEIGHT;
}

/** Convert a duration (minutes) to a height in px. */
export function minutesToHeight(min: number): number {
  return (min / 60) * HOUR_HEIGHT;
}

/**
 * Visual height for a study block, in px. Fixed at SLOT_VISUAL_MIN so
 * cards always have room for content even when the actual durationMin
 * is short (e.g. a 15-min review still gets a full hour of visual
 * real-estate; the literal end time is surfaced inside the card body).
 */
export function studyBlockHeightPx(): number {
  return minutesToHeight(SLOT_VISUAL_MIN);
}

/** Hour ticks, e.g. [8,9,10,...,22] — used by the leftmost ruler. */
export const HOUR_TICKS: number[] = (() => {
  const ticks: number[] = [];
  for (let h = DAY_START_MIN / 60; h <= DAY_END_MIN / 60; h++) ticks.push(h);
  return ticks;
})();
