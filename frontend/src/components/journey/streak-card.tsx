"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Trophy } from "lucide-react";

interface StreakResponse {
  currentStreak: number;
  longestStreak: number;
  todayActive: boolean;
  last7: string[];
  quote: string;
  source: "live" | "demo_seed";
}

interface StreakCardProps {
  studentId?: string;
  /** Compact 1-line variant for the home portal. */
  compact?: boolean;
}

/**
 * Streak card — Duolingo-style consecutive-day counter sourced from the
 * student's chat_logs activity. Renders a 7-day dot row, current streak,
 * personal best, and a streak-length-aware nudge.
 *
 * The compact variant is a single horizontal pill suitable for the home
 * portal hero, where space is tight.
 */
export function StreakCard({ studentId, compact = false }: StreakCardProps) {
  const [data, setData] = useState<StreakResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = studentId
      ? `/api/journey/streak?studentId=${studentId}`
      : "/api/journey/streak";
    fetch(url)
      .then((r) => r.json())
      .then((json: StreakResponse) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading || !data) {
    return (
      <div
        className={`rounded-2xl border border-[#e5e7eb] bg-white ${
          compact ? "h-14" : "h-40"
        } animate-pulse`}
      />
    );
  }

  const last7Set = new Set(data.last7);
  const dots = lastSevenKeys();

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-[#fde047] bg-[#fefce8] px-3 py-1.5">
        <Flame className="h-3.5 w-3.5 text-[#ea580c]" />
        <span className="text-xs font-semibold text-[#0f0f0f]">
          {data.currentStreak}-day streak
        </span>
        {data.todayActive && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#ea580c]"
            title="Active today"
          />
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-[#fde047] bg-gradient-to-br from-[#fefce8] to-[#fff7ed] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ea580c]">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
              Active streak
            </p>
            <p className="text-2xl font-bold text-[#0f0f0f]">
              {data.currentStreak}
              <span className="ml-1 text-sm font-medium text-[#6b7280]">
                day{data.currentStreak === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1">
          <Trophy className="h-3 w-3 text-[#ffb300]" />
          <span className="text-[11px] font-medium text-[#0f0f0f]">
            Best: {data.longestStreak}d
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {dots.map((d, i) => {
          const active = last7Set.has(d);
          const isToday = i === dots.length - 1;
          return (
            <div key={d} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`h-7 w-7 rounded-full transition ${
                  active
                    ? "bg-[#ea580c] ring-2 ring-[#fed7aa]"
                    : "bg-[#fef3c7]"
                } ${isToday ? "ring-2 ring-[#ffb300]" : ""}`}
                aria-hidden
              />
              <span className="text-[9px] font-medium text-[#6b7280]">
                {dayLetter(d)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 max-w-prose text-xs italic text-[#6b7280]">
        “{data.quote}”
      </p>
    </motion.div>
  );
}

function lastSevenKeys(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
  }
  return out;
}

function dayLetter(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}
