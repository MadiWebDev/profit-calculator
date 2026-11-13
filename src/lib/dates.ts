/**
 * Date helpers shared by the dashboard and the API.
 *
 * The order form's <input type="date"> produces a calendar date
 * ("2026-11-11"); the orders API validates a full ISO 8601 datetime.
 * A bare date is interpreted as midnight UTC on that calendar day, so
 * the stored date round-trips through orderDate.slice(0, 10) unchanged.
 */
import { z } from "zod";

/**
 * Zod field for an ISO 8601 datetime that also accepts a calendar date
 * ("2026-11-11"), normalizing it to midnight UTC. Garbage is still
 * rejected with the usual "Invalid ISO datetime" error.
 */
export const isoDateTimeField = z
  .string()
  .transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00.000Z` : s))
  .pipe(z.iso.datetime());

/**
 * Normalize a date input to a full ISO 8601 UTC datetime string.
 * Accepts a calendar date ("2026-11-11") and full ISO datetimes
 * (passed through, normalized to UTC). Throws RangeError for anything
 * else so callers can surface a validation error instead of storing
 * an invalid date.
 */
export function toIsoDateTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${value}`);
  return d.toISOString();
}

/**
 * Parse an optional `?from=` / `?to=` pair from a server page's
 * searchParams into a usable range.
 *
 * A param that is present but unparseable (e.g. `?from=not-a-date`,
 * `?from=`) falls back to the page's default for that end instead of
 * producing an Invalid Date — querying Mongo with an Invalid Date
 * throws a CastError and 500s the whole page (P&L N-1). A valid but
 * reversed range is returned as-is: it simply matches no orders.
 * Defaults: current month start → today, with `to` at end of day.
 */
export function parseDateRange(
  fromParam?: string,
  toParam?: string,
  now = new Date(),
): { from: Date; to: Date } {
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = new Date(fromParam ?? defaultFrom);
  const to = new Date(toParam ?? defaultTo);
  const validFrom = Number.isNaN(from.getTime()) ? new Date(defaultFrom) : from;
  const validTo = Number.isNaN(to.getTime()) ? new Date(defaultTo) : to;
  validTo.setHours(23, 59, 59, 999);
  return { from: validFrom, to: validTo };
}
