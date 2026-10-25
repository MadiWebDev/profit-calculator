/**
 * Meta ads sync hardening — pure helpers (Phase 5).
 *
 * No network, no database, no credentials, so every rule here is unit
 * tested in meta-ads-hardening.test.ts:
 *
 * - UTM parsing: Shopify orders carry the landing page URL, not parsed
 *   UTM fields. Attribution matches orders to campaigns ONLY on the
 *   utm_campaign/utm_source query params of that URL.
 * - Token exchange: Meta long-lived tokens last ~60 days. The exchange
 *   URL/response parsing lives here; the network call lives in
 *   sync/meta-ads.ts so this file stays testable offline.
 * - Sync window: a store that already synced only re-pulls from
 *   (lastSyncAt − 3 days) — Meta numbers settle over a few days, so
 *   the last 3 days are always re-pulled for delayed-reporting
 *   corrections, without re-pulling the whole 30-day history.
 * - Timezone: Meta reports in the ad account's timezone. Date strings
 *   sent to the API must be that timezone's calendar dates, not UTC's.
 * - Retries: 429 / 5xx / Meta rate-limit codes back off exponentially;
 *   an expired-token error (190) is NOT retried — it triggers a token
 *   refresh instead (see sync/meta-ads.ts).
 */

export interface UtmParams {
  utmSource?: string;
  utmCampaign?: string;
}

/**
 * Parse utm_source / utm_campaign from a landing-page URL. Returns {}
 * for missing, relative, or unparseable URLs — a bad landing URL must
 * never break an order import.
 */
export function parseUtmFromLandingSite(landingSite?: string | null): UtmParams {
  if (!landingSite) return {};
  try {
    const url = new URL(landingSite);
    const utmSource = url.searchParams.get("utm_source") ?? undefined;
    const utmCampaign = url.searchParams.get("utm_campaign") ?? undefined;
    return {
      ...(utmSource ? { utmSource } : {}),
      ...(utmCampaign ? { utmCampaign } : {}),
    };
  } catch {
    return {};
  }
}

/** Meta long-lived token exchange URL (fb_exchange_token grant). */
export function buildTokenExchangeUrl(
  appId: string,
  appSecret: string,
  shortLivedToken: string,
  apiVersion = "v21.0"
): string {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return `https://graph.facebook.com/${apiVersion}/oauth/access_token?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  /** Seconds until expiry, when Meta reports it. */
  expiresIn?: number;
}

/** Parse a token-exchange response; throws on a Meta error payload. */
export function parseTokenExchangeResponse(json: unknown): TokenExchangeResult {
  const body = (json ?? {}) as {
    access_token?: unknown;
    expires_in?: unknown;
    error?: { message?: string; code?: number };
  };
  if (body.error) {
    throw new Error(`Meta token exchange failed: ${body.error.message ?? "unknown error"}`);
  }
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Meta token exchange response missing access_token");
  }
  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : undefined;
  return { accessToken: body.access_token, ...(expiresIn !== undefined ? { expiresIn } : {}) };
}

/**
 * Calendar date (YYYY-MM-DD) of `date` in `timezone`. Falls back to the
 * UTC date for unknown timezones — a bad timezone name must never
 * break the sync window.
 */
export function dateInTimezone(date: Date, timezone?: string | null): string {
  if (!timezone) return date.toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export type SyncWindowMode = "full" | "incremental";

export interface SyncWindow {
  startDate: Date;
  endDate: Date;
  mode: SyncWindowMode;
}

const FULL_LOOKBACK_DAYS = 30;
const REPULL_DAYS = 3;

/**
 * Resolve the sync window. An explicit lookbackDays always wins (manual
 * full re-sync). Otherwise a previous lastSyncAt gives an incremental
 * window starting 3 days before the last sync (the delayed-reporting
 * repull tail); a first sync pulls the full 30-day history.
 */
export function resolveSyncWindow(input: {
  lastSyncAt?: Date | null;
  lookbackDays?: number;
  now?: Date;
}): SyncWindow {
  const now = input.now ?? new Date();
  if (input.lookbackDays !== undefined) {
    return {
      startDate: new Date(now.getTime() - input.lookbackDays * 864e5),
      endDate: now,
      mode: "full",
    };
  }
  if (input.lastSyncAt) {
    return {
      startDate: new Date(input.lastSyncAt.getTime() - REPULL_DAYS * 864e5),
      endDate: now,
      mode: "incremental",
    };
  }
  return {
    startDate: new Date(now.getTime() - FULL_LOOKBACK_DAYS * 864e5),
    endDate: now,
    mode: "full",
  };
}

/** Meta error codes that mean "rate limited, retry later". */
const RETRYABLE_META_CODES = new Set([17, 80004, 80005]);

/**
 * Whether a failed Meta call is worth retrying (rate limit or transient
 * server error). Auth errors (190), permission errors and bad requests
 * are NOT retryable — retrying them only burns quota.
 */
export function shouldRetryMetaError(input: { status?: number; code?: number }): boolean {
  const { status, code } = input;
  if (code !== undefined && RETRYABLE_META_CODES.has(code)) return true;
  if (status === 429) return true;
  if (status !== undefined && status >= 500 && status < 600) return true;
  return false;
}

/** Exponential backoff: 1s, 2s, 4s, capped at 30s. */
export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt), 30000);
}
