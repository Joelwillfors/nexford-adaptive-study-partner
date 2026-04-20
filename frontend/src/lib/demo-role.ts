"use client";

/**
 * Demo role toggle — a tiny client-side switch that hides student UI from
 * teachers and teacher UI from students during the demo.
 *
 * This is deliberately NOT auth. The server still serves both surfaces to
 * anyone; we only filter what the nav shows so the demo flow stays clean
 * when a teacher clicks around the student dashboard and vice versa. Real
 * per-role API gating lives in Phase 4.
 *
 * State lives in localStorage under `nx.demoRole`. We fan-out a custom
 * `nx:role-change` event on write so open tabs update in sync with the
 * native `storage` event (which only fires in *other* tabs).
 */
import { useEffect, useState } from "react";

export type DemoRole = "student" | "teacher";

const STORAGE_KEY = "nx.demoRole";
const CHANGE_EVENT = "nx:role-change";
const VALID_ROLES: ReadonlySet<DemoRole> = new Set([
  "student",
  "teacher",
]);

function readRole(): DemoRole {
  if (typeof window === "undefined") return "student";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && VALID_ROLES.has(raw as DemoRole)) return raw as DemoRole;
  return "student";
}

export function useDemoRole(): [DemoRole, (next: DemoRole) => void] {
  // Always start from "student" on the server and on first client render to
  // avoid a hydration mismatch. The real value is hydrated in the effect.
  const [role, setRole] = useState<DemoRole>("student");

  useEffect(() => {
    setRole(readRole());
    const onChange = () => setRole(readRole());
    window.addEventListener("storage", onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  const update = (next: DemoRole) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, next);
    setRole(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  };

  return [role, update];
}
