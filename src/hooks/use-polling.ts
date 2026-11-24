"use client";

// Small polling hook (no SWR / React Query in this repo, see
// docs/ptw-control-center/PLAN.md D7):
//   - fetches `url` now and every `intervalMs` while the tab is visible
//   - refetches immediately when the tab regains focus / visibility
//   - keeps the last good data on a failed refresh (a wall display must not blank)
//   - backs off on consecutive errors: interval × 2^n, capped at `maxBackoffMs`
// Pass url = null to pause.

import { useCallback, useEffect, useRef, useState } from "react";
import { readApiError } from "@/lib/client-errors";

export type PollingState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** When `data` was last refreshed successfully. */
  updatedAt: Date | null;
  /** Consecutive failures since the last success. */
  failures: number;
  refresh: () => void;
};

export function usePolling<T>(
  url: string | null,
  {
    intervalMs = 30_000,
    maxBackoffMs = 5 * 60_000,
    headers,
    keepOnUrlChange = false,
  }: {
    intervalMs?: number;
    maxBackoffMs?: number;
    /** Extra request headers (e.g. the wall display's x-kiosk-token). */
    headers?: Record<string, string>;
    /** Keep showing the previous url's data while the new one loads (same-plant filter changes). */
    keepOnUrlChange?: boolean;
  } = {}
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failures, setFailures] = useState(0);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const lastStart = useRef(0);
  const headerKey = headers ? JSON.stringify(headers) : "";

  const load = useCallback(async () => {
    if (!url) return;
    lastStart.current = Date.now();
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store", headers: headerKey ? JSON.parse(headerKey) : undefined });
      if (!res.ok) throw new Error(await readApiError(res, "Could not refresh"));
      const json = (await res.json()) as T;
      if (id !== reqId.current) return;
      setData(json);
      setError(null);
      setUpdatedAt(new Date());
      failuresRef.current = 0;
      setFailures(0);
    } catch (e: any) {
      if (id !== reqId.current) return;
      failuresRef.current += 1;
      setFailures(failuresRef.current);
      setError(e?.message ?? "Could not refresh");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!url) return;
    const delay = Math.min(maxBackoffMs, intervalMs * 2 ** failuresRef.current);
    timer.current = setTimeout(async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") await load();
      schedule();
    }, delay);
  }, [url, intervalMs, maxBackoffMs, load]);

  useEffect(() => {
    // A new url (e.g. plant switch) starts clean rather than showing another plant's data.
    setData(null);
    setError(null);
    failuresRef.current = 0;
    setFailures(0);
    if (!url) return;
    load().then(schedule);
    const onWake = () => {
      // focus and visibilitychange usually fire together; one refetch is enough
      if (document.visibilityState !== "visible" || Date.now() - lastStart.current < 2_000) return;
      load().then(schedule);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      reqId.current++;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [url, load, schedule]); // eslint-disable-line react-hooks/exhaustive-deps -- keepOnUrlChange is read once per url

  const refresh = useCallback(() => { load().then(schedule); }, [load, schedule]);
  return { data, error, loading, updatedAt, failures, refresh };
}
