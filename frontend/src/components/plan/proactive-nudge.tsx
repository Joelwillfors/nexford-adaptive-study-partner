"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";

/**
 * ProactiveNudge — banner that proves the system is forward-looking.
 *
 * Reads /api/journey/last-struggle (real signal from learner_profiles)
 * and falls back to a seeded "Depreciation" concept so the demo always
 * has something to show. Suppressed for the rest of the browser session
 * once dismissed via sessionStorage.
 *
 * Two variants:
 *   - default (used on /plan): full banner with the Yes/No CTA pair.
 *   - compact (used on the home portal): single-line teaser linking
 *     to /plan to take action — keeps the home page from getting busy.
 */
interface ProactiveNudgeResponse {
  concept: string;
  label: string;
  lastSeen: string | null;
  interventionCost: number;
  source: "live" | "demo_seed";
}

interface ProactiveNudgeProps {
  /** Called when the user accepts the suggestion. Default mounts a
   *  5-min review on next Monday in the parent's plan state. */
  onAccept?: (concept: string, label: string) => void;
  variant?: "default" | "compact";
}

// Bumped to v2 so any sessionStorage flags set under the original key
// (which lingered across server restarts and silently suppressed the
// nudge for the demo) are ignored. Scoped per variant so dismissing
// the compact banner on /portal doesn't also kill the full banner on
// /plan — each surface has its own opt-out.
const DISMISS_KEY_BASE = "nx.nudge.dismissed.v2";

export function ProactiveNudge({
  onAccept,
  variant = "default",
}: ProactiveNudgeProps) {
  const [data, setData] = useState<ProactiveNudgeResponse | null>(null);
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const dismissKey = `${DISMISS_KEY_BASE}.${variant}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(dismissKey) === "1") return;
    let cancelled = false;
    fetch("/api/journey/last-struggle")
      .then((r) => r.json())
      .then((json: ProactiveNudgeResponse) => {
        if (cancelled) return;
        setData(json);
        setVisible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dismissKey]);

  function dismiss() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(dismissKey, "1");
    }
    setVisible(false);
  }

  function handleAccept() {
    if (!data) return;
    onAccept?.(data.concept, data.label);
    setAccepted(true);
    setTimeout(dismiss, 1600);
  }

  if (!data) return null;

  const compact = variant === "compact";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className={`relative overflow-hidden rounded-2xl border border-[#fde047] bg-gradient-to-r from-[#fefce8] to-[#fff7ed] ${
            compact ? "px-4 py-3" : "mt-4 px-5 py-4"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex shrink-0 items-center justify-center rounded-xl bg-[#ffb300] ${
                compact ? "h-7 w-7" : "h-9 w-9"
              }`}
            >
              <Sparkles
                className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
                color="#0f0f0f"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[10px] font-semibold uppercase tracking-widest text-[#92400e] ${
                  compact ? "leading-none" : ""
                }`}
              >
                Socrates noticed something
              </p>
              <p
                className={`text-[#0f0f0f] ${
                  compact
                    ? "mt-0.5 text-xs"
                    : "mt-1 text-sm leading-relaxed"
                }`}
              >
                {accepted ? (
                  <>
                    Got it — added a 5-minute {data.label} refresher to
                    Monday&apos;s plan.
                  </>
                ) : (
                  <>
                    {data.label} was challenging today. Want me to slot a
                    5-minute review for next Monday so it stays warm?
                  </>
                )}
              </p>
              {!accepted && (
                <div
                  className={`flex flex-wrap items-center gap-2 ${
                    compact ? "mt-2" : "mt-3"
                  }`}
                >
                  {compact ? (
                    <a
                      href="/plan"
                      className="rounded-full bg-[#0f0f0f] px-3 py-1 text-[11px] font-semibold text-[#ffb300] transition hover:bg-[#1f1f1f]"
                    >
                      Open the planner
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAccept}
                      className="rounded-full bg-[#0f0f0f] px-3.5 py-1.5 text-xs font-semibold text-[#ffb300] transition hover:bg-[#1f1f1f]"
                    >
                      Yes, build it
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-medium text-[#0f0f0f] transition hover:border-[#fde047]"
                  >
                    Not now
                  </button>
                  <span className="ml-auto text-[10px] uppercase tracking-widest text-[#92400e]/70">
                    {data.source === "live" ? "Live signal" : "Demo seed"}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="ml-1 rounded p-1 text-[#92400e] transition hover:bg-white/60"
            >
              <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
