/**
 * Shared helpers for dashboard list pages that take user input into
 * MongoDB queries or pagination.
 *
 * Pure functions — no DB, no side effects, fully unit-testable.
 */

/**
 * Escape a user-typed search term for safe use inside a MongoDB `$regex`.
 * Without this, a single `[` (or `(`, `\`, …) throws a MongoServerError
 * and 500s the page — the term is a literal string, never a pattern.
 * (Same pattern as the private escapeRegex in src/lib/admin-messages.ts;
 * kept here as the shared, tested copy for list pages.)
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a `?page=` query value into a safe 1-based page number.
 * Anything missing, non-numeric, fractional-garbage, zero or negative
 * falls back to `fallback` (default 1) instead of reaching Mongo as
 * skip(-50) (500) or rendering "Page NaN".
 */
export function parsePageParam(
  raw: string | undefined | null,
  fallback = 1
): number {
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
