/**
 * Life events — hand-seeded "real life" calendar blocks for the demo.
 *
 * The Planner Agent currently schedules study slots without any
 * awareness of the student's real calendar. For the demo we mock that
 * awareness by injecting non-study events into the day columns. Visual
 * only — the planner-agent's daily load budget already leaves enough
 * headroom that nothing collides.
 *
 * In production these would come from a Google/Outlook calendar
 * integration via OAuth and feed into the planner's load calculation
 * (e.g., an 8-hour lecture day caps the study budget at 2 units).
 */

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type LifeEventKind = "lecture" | "fitness" | "social" | "work";

/** Where this event originated. Drives the small provenance pill on the
 *  calendar card so the demo can prove the LMSProvider abstraction is
 *  actually feeding the schedule, not just sitting in a config file. */
export type LifeEventSource = "canvas" | "manual" | "rule";

export interface LifeEvent {
  /** Compact label rendered on the card. */
  label: string;
  /** Local-time clock window e.g. "9:00 - 11:00". */
  time: string;
  /** Drives the icon + colour. */
  kind: LifeEventKind;
  /** Provenance — undefined defaults to "manual" (i.e. seed data without
   *  an explicit source attribution). */
  source?: LifeEventSource;
}

export const LIFE_EVENTS: Record<DayOfWeek, LifeEvent[]> = {
  Mon: [
    {
      label: "University Lecture",
      time: "9:00 - 11:00",
      kind: "lecture",
      source: "canvas",
    },
  ],
  Tue: [{ label: "Gym", time: "18:00 - 19:00", kind: "fitness" }],
  Wed: [
    { label: "Group project call", time: "15:00 - 16:00", kind: "work" },
  ],
  Thu: [{ label: "Gym", time: "18:00 - 19:00", kind: "fitness" }],
  Fri: [
    {
      label: "University Lecture",
      time: "9:00 - 11:00",
      kind: "lecture",
      source: "canvas",
    },
  ],
  Sat: [],
  Sun: [{ label: "Family dinner", time: "18:00 - 20:00", kind: "social" }],
};

const DAY_INDEX: DayOfWeek[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

/** Map an ISO date or `dayLabel` short string to its event list.
 *
 *  `opts.includeCanvas` defaults to `true` so existing callers keep their
 *  previous behaviour. The `/plan` page passes `false` until the user
 *  clicks "Import from Canvas", so the demo can show the before/after
 *  effect of the LMSProvider sync. Per-page-load reset — no persistence. */
export function eventsForDay(
  dayLabel: string,
  opts?: { includeCanvas?: boolean },
): LifeEvent[] {
  const includeCanvas = opts?.includeCanvas ?? true;
  const key = (dayLabel as DayOfWeek) in LIFE_EVENTS
    ? (dayLabel as DayOfWeek)
    : null;
  const all = key ? LIFE_EVENTS[key] : [];
  return includeCanvas ? all : all.filter((e) => e.source !== "canvas");
}

export function eventsForDate(
  isoDate: string,
  opts?: { includeCanvas?: boolean },
): LifeEvent[] {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return [];
  const all = LIFE_EVENTS[DAY_INDEX[d.getDay()]];
  const includeCanvas = opts?.includeCanvas ?? true;
  return includeCanvas ? all : all.filter((e) => e.source !== "canvas");
}
