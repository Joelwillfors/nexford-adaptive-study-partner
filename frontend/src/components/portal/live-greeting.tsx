"use client";

import { useEffect, useState } from "react";

interface LiveGreetingProps {
  firstName: string;
}

/**
 * Renders the home-portal greeting block: a live local-time chip and a
 * time-of-day-aware heading ("Good morning" / "Good afternoon" / "Good
 * evening" / "Working late"). Client-only because we want the user's
 * local clock, not the server's, and because the chip ticks every
 * minute so a long session does not show stale time.
 *
 * Why a separate component: the home page is an async server component
 * for SSR-friendly Canvas data fetching. Lifting this client island out
 * keeps that boundary clean.
 */
export function LiveGreeting({ firstName }: LiveGreetingProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const tick = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  // SSR pass + first paint: render a stable placeholder so hydration
  // does not mismatch and the layout doesn't shift.
  if (!now) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
          &nbsp;
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
          Welcome back, {firstName}.
        </h1>
      </div>
    );
  }

  const dateLabel = now.toLocaleString("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
        {dateLabel}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0f0f0f]">
        {greetingFor(now.getHours())}, {firstName}.
      </h1>
    </div>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Working late";
}
