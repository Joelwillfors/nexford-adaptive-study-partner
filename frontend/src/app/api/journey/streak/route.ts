import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";
import { DEMO_MODE } from "@/lib/flags";
import { DEMO_STUDENT } from "@/lib/demo-identity";

/**
 * GET /api/journey/streak?studentId=<uuid>
 *
 * Computes the student's "active days" streak from chat_logs. A day
 * counts if the student posted at least one message that day in the
 * project timezone (Europe/Stockholm — Sara is the demo persona).
 *
 * Returns:
 *   - currentStreak: consecutive days ending today (or yesterday if no
 *     activity today yet, so the streak doesn't reset just because the
 *     student hasn't logged in by 9am).
 *   - longestStreak: longest streak in the trailing 60-day window.
 *   - todayActive: boolean — already studied today.
 *   - last7: ISO dates with at least one student turn (for sparkline).
 *   - quote: motivational nudge keyed off the streak length.
 *
 * Demo fallback: in DEMO_MODE or on Supabase failure, return a hand-
 * seeded 7-day streak so the home portal looks alive offline.
 */

const DEMO_FALLBACK = {
  currentStreak: 7,
  longestStreak: 12,
  todayActive: true,
  last7: lastNDates(7),
  quote: streakQuote(7),
  source: "demo_seed" as const,
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId") ?? DEMO_STUDENT.id;

  if (DEMO_MODE) {
    return NextResponse.json(DEMO_FALLBACK);
  }

  try {
    const supabase = createServiceClient();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 60);

    const { data, error } = await supabase
      .from("chat_logs")
      .select("created_at")
      .eq("user_id", studentId)
      .eq("role", "user")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw error;

    const days = new Set<string>();
    for (const row of data ?? []) {
      const d = toLocalDateKey(new Date(row.created_at as string));
      days.add(d);
    }

    const todayKey = toLocalDateKey(new Date());
    const todayActive = days.has(todayKey);

    const cursor = new Date();
    if (!todayActive) cursor.setDate(cursor.getDate() - 1);

    let currentStreak = 0;
    while (days.has(toLocalDateKey(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    let longestStreak = 0;
    let run = 0;
    const scan = new Date(since);
    const today = new Date();
    while (scan <= today) {
      if (days.has(toLocalDateKey(scan))) {
        run += 1;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
      scan.setDate(scan.getDate() + 1);
    }

    const last7 = lastNDates(7).filter((d) => days.has(d));

    return NextResponse.json({
      currentStreak,
      longestStreak,
      todayActive,
      last7,
      quote: streakQuote(currentStreak),
      source: "live" as const,
    });
  } catch (err) {
    console.error("[streak] failed, returning demo seed", err);
    return NextResponse.json(DEMO_FALLBACK);
  }
}

function toLocalDateKey(d: Date): string {
  // Stable YYYY-MM-DD in local time so day boundaries follow the user.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(toLocalDateKey(d));
  }
  return out;
}

function streakQuote(streak: number): string {
  if (streak <= 0)
    return "A small start today beats a perfect plan tomorrow. Open one module.";
  if (streak < 3)
    return "Two days in a row is the hardest part. Stack one more.";
  if (streak < 7)
    return "Five days makes a habit. You're already past day three.";
  if (streak < 14)
    return "A week of consistency teaches your brain this matters.";
  return "Continuous learning compounds. You're building real fluency now.";
}
