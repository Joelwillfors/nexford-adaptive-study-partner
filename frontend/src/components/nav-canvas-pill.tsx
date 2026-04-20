"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface ProviderHealth {
  name: string;
  mode: "mock" | "live";
  configured: boolean;
  lastSyncedAt: string;
}

/**
 * Compact "Connected to Canvas" pill for the navbar. Reads the LMS
 * provider's health endpoint so the badge is honest about what's
 * actually wired (Mock vs Live, configured vs unconfigured) instead
 * of being purely decorative.
 *
 * The "Last synced" relative timestamp ticks every 30s so a long demo
 * doesn't show a stale "1m ago" frozen forever.
 */
export function NavCanvasPill() {
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/gradebook-export")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProviderHealth | null) => {
        if (!cancelled && data) setHealth(data);
      })
      .catch(() => {});
    const intv = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(intv);
    };
  }, []);

  if (!health) return null;

  const ago = relativeAgo(health.lastSyncedAt, tick);
  const isMock = health.mode === "mock";

  return (
    <div
      className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] sm:inline-flex ${
        isMock
          ? "border-[#fde047] bg-[#fefce8] text-[#854d0e]"
          : health.configured
            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
            : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
      }`}
      title={`${health.name} · last synced ${ago}`}
    >
      {isMock || health.configured ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      <span className="whitespace-nowrap font-semibold">Canvas</span>
    </div>
  );
}

function relativeAgo(iso: string, _tick: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then) || then === 0) return "never";
  const diff = Date.now() - then;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
