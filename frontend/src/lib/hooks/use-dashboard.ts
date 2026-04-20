"use client";

/**
 * useDashboard — fetches `/api/dashboard` once per mount and returns a
 * typed payload plus loading/error state. Deliberately simple (no SWR,
 * no refetch) because the teacher surfaces are not long-lived SPA
 * sessions; reloading the page to re-fetch is the normal flow.
 *
 * Extracted from `/teacher/page.tsx` during the IA split so both
 * Class Intelligence and Student Watchlist can share the same request
 * without double-fetching when the user toggles between them.
 */
import { useEffect, useState } from "react";
import type { DashboardData } from "@/components/teacher/types";

interface UseDashboard {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
}

export function useDashboard(): UseDashboard {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload: DashboardData) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
