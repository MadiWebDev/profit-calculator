/**
 * Display timezone — the locked per-user timezone is the dashboard's
 * display timezone for dates/times (v1 scope). Report aggregation
 * boundaries keep the existing team/ad-account rules — this module
 * only formats what is already rendered, it never re-buckets data.
 *
 * Precedence: user timezone > team timezone > browser timezone > UTC.
 * Every formatter fails open to UTC on a bad zone, never throws.
 */
import { isValidTimezone } from "@/lib/timezones";

export function resolveDisplayTimezone(input: {
  userTimezone?: string | null;
  teamTimezone?: string | null;
}): string {
  if (isValidTimezone(input.userTimezone ?? null)) return input.userTimezone as string;
  if (isValidTimezone(input.teamTimezone ?? null)) return input.teamTimezone as string;
  try {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimezone(browser)) return browser;
  } catch {
    // No Intl timezone available — fall through to UTC.
  }
  return "UTC";
}

function formatInTimezone(
  date: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const tz = isValidTimezone(timeZone) ? timeZone : "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options }).format(d);
  } catch {
    return d.toLocaleDateString("en-US");
  }
}

/** "Jan 15" — chart axes, table date cells. */
export function formatDateInTimezone(date: string | Date, timeZone: string): string {
  return formatInTimezone(date, timeZone, { month: "short", day: "numeric" });
}

/** "Jan 15, 2026" — full date cells, "last synced" stamps. */
export function formatDateFullInTimezone(date: string | Date, timeZone: string): string {
  return formatInTimezone(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Jan 15, 2026, 05:30 PM" — date + time stamps. */
export function formatDateTimeInTimezone(date: string | Date, timeZone: string): string {
  return formatInTimezone(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "05:30 PM" — time-only cells. */
export function formatTimeInTimezone(date: string | Date, timeZone: string): string {
  return formatInTimezone(date, timeZone, { hour: "numeric", minute: "2-digit" });
}
