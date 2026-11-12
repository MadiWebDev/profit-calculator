"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import {
  resolveDisplayTimezone,
  formatDateInTimezone,
  formatDateFullInTimezone,
  formatDateTimeInTimezone,
  formatTimeInTimezone,
} from "@/lib/display-timezone";

/**
 * Display-timezone context — the dashboard's display timezone for
 * dates/times is the user's LOCKED timezone (set in onboarding), then
 * the team timezone, then the browser timezone (see
 * src/lib/display-timezone.ts). The team value is fetched from
 * GET /api/team on sign-in; a signed-out visitor gets the browser
 * timezone. Report aggregation boundaries are NOT touched by this
 * context — it only formats dates that are already rendered.
 */

export interface TimezoneContextValue {
  /** IANA zone used to display dates/times, e.g. "Asia/Karachi". */
  timezone: string;
  /** "Jan 15" in the display timezone. */
  formatDate: (date: string | Date) => string;
  /** "Jan 15, 2026" in the display timezone. */
  formatDateFull: (date: string | Date) => string;
  /** "Jan 15, 2026, 05:30 PM" in the display timezone. */
  formatDateTime: (date: string | Date) => string;
  /** "05:30 PM" in the display timezone. */
  formatTime: (date: string | Date) => string;
}

export const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: "UTC",
  formatDate: (d) => formatDateInTimezone(d, "UTC"),
  formatDateFull: (d) => formatDateFullInTimezone(d, "UTC"),
  formatDateTime: (d) => formatDateTimeInTimezone(d, "UTC"),
  formatTime: (d) => formatTimeInTimezone(d, "UTC"),
});

export function useDisplayTimezone(): TimezoneContextValue {
  return useContext(TimezoneContext);
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userTimezone = (session?.user as { timezone?: string | null } | undefined)?.timezone ?? null;
  const [teamTimezone, setTeamTimezone] = useState<string | null>(null);

  // Team timezone is the fallback for users who have not locked their
  // own yet (grandfathered users before they complete onboarding).
  // Keyed on auth state like the CurrencyProvider's workspace fetch:
  // the provider lives in the root layout and does not remount on
  // login, so a mount-only fetch would run signed-out (401) and never
  // re-run after sign-in.
  useEffect(() => {
    if (status !== "authenticated") {
      /* eslint-disable react-hooks/set-state-in-effect -- auth-state reset: clear the team timezone when the session ends. */
      setTeamTimezone(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const tz = j?.team?.timezone;
        setTeamTimezone(typeof tz === "string" ? tz : null);
      })
      .catch(() => {
        // Team unknown — the browser timezone is the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const timezone = useMemo(
    () => resolveDisplayTimezone({ userTimezone, teamTimezone }),
    [userTimezone, teamTimezone],
  );

  const formatDate = useCallback((d: string | Date) => formatDateInTimezone(d, timezone), [timezone]);
  const formatDateFull = useCallback(
    (d: string | Date) => formatDateFullInTimezone(d, timezone),
    [timezone],
  );
  const formatDateTime = useCallback(
    (d: string | Date) => formatDateTimeInTimezone(d, timezone),
    [timezone],
  );
  const formatTime = useCallback((d: string | Date) => formatTimeInTimezone(d, timezone), [timezone]);

  const value = useMemo(
    () => ({ timezone, formatDate, formatDateFull, formatDateTime, formatTime }),
    [timezone, formatDate, formatDateFull, formatDateTime, formatTime],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}
