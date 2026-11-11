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
