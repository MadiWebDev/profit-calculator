/**
 * Money-currency helpers — the "no money without an explicit currency"
 * rule (order-currency fix, Phases 1 + 2, unified).
 *
 * PURE logic only: no network, no database, no Node built-ins. Safe to
 * import from API routes, from vitest (route modules themselves cannot
 * be imported in vitest — the auth chain pulls in next/server), AND
 * from client components (OrdersClient imports defaultFormCurrency).
 *
 * That last part is why this file must stay pure: the DB-backed
 * derivation, deriveMoneyCurrency, lives in ./money-currency-server.ts
 * instead. It imports the mongoose models, and a single static import
 * of them here would drag mongoose (fs/net/tls/dns/…) into the client
 * bundle and fail the production build with 18 "Module not found"
 * errors (found by the Phase 3 integration build). Never import a
 * model — or the server module — from this file or from any client
 * component; server routes import deriveMoneyCurrency from
 * ./money-currency-server.ts directly.
 *
 * A currency code is usable when it is a 3-letter ISO 4217 code
 * (case-insensitive, e.g. "pkr" normalizes to "PKR"). Shape only — the
 * 148-currency registry lives in the CurrencyContext client component
 * and cannot be imported from server code.
 *
 * Two APIs live here, sharing one normalization:
 *
 * - Phase 1 (orders): `normalizeCurrencyCode`, `resolveOrderCurrency`
 *   ({sent, user, team, store}), `defaultFormCurrency` — the currency
 *   for a manually entered order, with the client-sent value first.
 * - Phase 2 (other money): `normalizeMoneyCurrency`,
 *   `resolveMoneyCurrency` ({user, team, store}) — the pure precedence
 *   pick. The DB-backed half of Phase 2, `deriveMoneyCurrency`
 *   ({userId?, teamId, storeId?}), is in ./money-currency-server.ts.
 *
 * Precedence in both APIs: sent (orders only) > user displayCurrency
 * > team currency > store currency. ("Store currency" is the selected
 * store's own currency when a storeId is known, otherwise the team's
 * most common store currency.)
 *
 * USD is NEVER a fallback here: when no source yields a usable code,
 * the resolvers return null so the caller rejects the write instead of
 * silently storing USD. A team's own configured currency (Team.currency,
 * which the model defaults to "USD" at team creation) is a legitimate
 * answer — it is the team's setting, not a silent per-write default.
 */
import { isValidCurrencyCode } from "@/lib/display-currency";

/** Shared implementation: trim + uppercase a candidate code; null when it is not a 3-letter code. */
function normalize(code: unknown): string | null {
  if (!isValidCurrencyCode(code)) return null;
  return (code as string).toUpperCase().trim();
}

/** Trim + uppercase a candidate code; null when it is not a 3-letter code. */
export function normalizeCurrencyCode(code: unknown): string | null {
  return normalize(code);
}

/** A single code, upper-cased, or null when it is not a 3-letter code. */
export function normalizeMoneyCurrency(code: unknown): string | null {
  return normalize(code);
}

export interface OrderCurrencySources {
  /** Currency the client sent with the write (may be missing/invalid). */
  sent?: unknown;
  /** The signed-in user's locked display currency (User.displayCurrency). */
  user?: unknown;
  /** The team's workspace currency (Team.currency). */
  team?: unknown;
  /** The store's currency (Store.currency). */
  store?: unknown;
}

/**
 * Resolve the currency for a manually entered order.
 *
 * Precedence: sent > user display > team > store. Returns null when
 * every source is missing or invalid — the caller must then reject the
 * write (400 / skip the row), never invent a currency.
 */
export function resolveOrderCurrency(sources: OrderCurrencySources): string | null {
  return (
    normalizeCurrencyCode(sources.sent) ??
    normalizeCurrencyCode(sources.user) ??
    normalizeCurrencyCode(sources.team) ??
    normalizeCurrencyCode(sources.store) ??
    null
  );
}

/**
 * The currency a manual money form should start with: the stored
 * currency of the row being edited, else the user's display currency.
 * Returns null when neither is a usable code (the caller falls back to
 * the resolved display currency, which is always a valid code).
 */
export function defaultFormCurrency(stored: unknown, display: unknown): string | null {
  return normalizeCurrencyCode(stored) ?? normalizeCurrencyCode(display);
}

export interface MoneyCurrencySources {
  /** The signed-in user's locked display currency. */
  user?: string | null;
  /** The team's configured currency (Team.currency). */
  team?: string | null;
  /** The store currency (selected store, or most common store). */
  store?: string | null;
}

/**
 * Pure precedence pick — user > team > store — first valid 3-letter
 * code wins. Returns null when nothing is valid: the caller must
 * reject the write, never fall back to USD.
 */
export function resolveMoneyCurrency(sources: MoneyCurrencySources): string | null {
  for (const code of [sources.user, sources.team, sources.store]) {
    const normalized = normalizeMoneyCurrency(code);
    if (normalized) return normalized;
  }
  return null;
}
