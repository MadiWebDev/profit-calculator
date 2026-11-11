/**
 * Display-currency helpers — pure functions for the live FX widget and
 * the display-currency switcher (see src/components/dashboard/CurrencyContext).
 *
 * Everything in this module is network-free and side-effect-free so it
 * can be unit-tested without a provider key, a database, or a browser.
 *
 * Two currencies must never be confused:
 *  - the REPORT BASE currency: what server aggregates are summed in
 *    (the team's most common store currency, per src/lib/report-currency).
 *    Money figures arrive in the client in this currency and are
 *    CONVERTED from it into the display currency.
 *  - the DISPLAY currency: what the viewer chose in the header switcher.
 *    It only changes how figures are shown, never the stored numbers.
 *
 * Honest limit: on the free currencyapi.net plan the provider data
 * refreshes hourly. The 60-second client refresh only re-fetches the
 * cached rate; true 60-second live rates need the paid StartUp plan.
 * The "Rates as of HH:MM" stamp (formatRatesAsOf) is what keeps the
 * widget honest — it must never pretend to be fresher than it is.
 */

/** A 3-letter ISO 4217 code, upper-cased and trimmed. */
export function isValidCurrencyCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z]{3}$/.test(code.toUpperCase().trim());
}

function normalizeCode(code: unknown): string | null {
  if (!isValidCurrencyCode(code)) return null;
  return (code as string).toUpperCase().trim();
}

/**
 * Resolve the display currency from the available sources, in
 * precedence order: the team's saved workspace setting wins, then the
 * browser's stored choice, then the workspace reporting currency
 * (the store/base currency — the migration-safe default for teams
 * that never picked a display currency), then USD.
 */
export function resolveDisplayCurrency(opts: {
  server?: string | null;
  stored?: string | null;
  reportingCurrency?: string | null;
  fallback?: string;
}): string {
  const fallback = normalizeCode(opts.fallback) ?? "USD";
  return (
    normalizeCode(opts.server) ??
    normalizeCode(opts.stored) ??
    normalizeCode(opts.reportingCurrency) ??
    fallback
  );
}

/**
 * The most common currency in a list of store currencies — the same
 * rule the server uses for the report base currency
 * (getReportBaseCurrency in src/lib/report-currency): the single most
 * frequent store currency, falling back to USD when there is no store
 * with a currency. Ties go to the first currency seen.
 */
export function mostCommonCurrency(codes: (string | null | undefined)[]): string {
  const counts = new Map<string, number>();
  for (const raw of codes) {
    const code = normalizeCode(raw);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best = "USD";
  let bestCount = 0;
  for (const [code, n] of counts) {
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  }
  return best;
}

/**
 * "Rates as of HH:MM" in the viewer's local time, from the ISO
 * `fetchedAt` timestamp the /api/fx/rates endpoint returns. Returns
 * "Rates unavailable" when there is no usable timestamp — the widget
 * must show that rather than a stale-looking time or no stamp at all.
 */
export function formatRatesAsOf(fetchedAt: string | null | undefined): string {
  if (!fetchedAt) return "Rates unavailable";
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return "Rates unavailable";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Rates as of ${hh}:${mm}`;
}

/** The /api/fx/rates payload shape the widget consumes. */
export interface FxRatesPayload {
  rates: Record<string, number>;
  /** ISO timestamp of the provider data, or null when the server did not send one. */
  fetchedAt: string | null;
}

/**
 * Validate an /api/fx/rates JSON payload. Returns null for anything
 * that is not a usable rates table (missing/empty rates, no positive
 * finite rate). Unknown or non-positive entries are dropped, codes
 * are upper-cased; the base currency itself is NOT injected here —
 * the server already injects rates[base] = 1 (see src/lib/fx.ts).
 */
export function parseFxRatesPayload(payload: unknown): FxRatesPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const data = payload as { rates?: unknown; fetchedAt?: unknown };
  if (!data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) return null;
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(data.rates as Record<string, unknown>)) {
    const upper = code.toUpperCase().trim();
    const n = typeof value === "number" ? value : Number(value);
    if (/^[A-Z]{3}$/.test(upper) && Number.isFinite(n) && n > 0) {
      rates[upper] = n;
    }
  }
  if (Object.keys(rates).length === 0) return null;
  return {
    rates,
    fetchedAt: typeof data.fetchedAt === "string" && data.fetchedAt.length > 0 ? data.fetchedAt : null,
  };
}

/**
 * The honest-limit note shown under the converter widget and the
 * display-currency switcher. The 60-second refresh re-fetches the
 * cached rate; the provider data itself only refreshes hourly on the
 * free plan.
 */
export const FX_FREE_PLAN_NOTE =
  "On the free currencyapi.net plan, provider rates refresh hourly — the 60-second refresh re-fetches the cached rate. True 60-second live rates need the paid StartUp plan.";
