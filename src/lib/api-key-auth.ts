/**
 * Validates a public API key from Authorization: Bearer header.
 * Used by /api/v1/* routes via requireV1Access().
 *
 * Key format: pc_live_<random> (stored as SHA-256 hash, never plaintext).
 * Correct status codes: 401 = missing/invalid/expired key,
 * 403 = valid key but missing scope, 429 = per-key rate limit exceeded.
 */
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { rateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limit";

export interface ApiKeySession {
  teamId: string;
  scopes: string[];
  keyId: string;
  accessLevel: "read" | "write";
}

export type ApiKeyFailure =
  | { reason: "missing" }
  | { reason: "invalid" }
  | { reason: "expired" }
  | { reason: "rate_limited"; resetAt: number };

/**
 * Validate the Bearer API key. Returns the session, or a failure reason
 * so callers can return the correct status code (401 vs 429).
 */
export async function validateApiKey(
  req: Request
): Promise<{ ok: true; session: ApiKeySession } | { ok: false; failure: ApiKeyFailure }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer pc_live_")) {
    return { ok: false, failure: { reason: "missing" } };
  }

  const raw = authHeader.slice(7); // strip "Bearer "

  // Per-key rate limit — checked BEFORE the DB lookup (cheap reject)
  const prefix = raw.slice(0, 16);
  const rl = await Promise.resolve(
    rateLimit(`apikey:${prefix}`, RATE_LIMIT_PRESETS.standard)
  );
  if (!rl.ok) {
    return { ok: false, failure: { reason: "rate_limited", resetAt: rl.resetAt } };
  }

  const hash = createHash("sha256").update(raw).digest("hex");

  await connectDB();
  const key = await ApiKeyModel.findOne({ keyHash: hash, isActive: true });
  if (!key) return { ok: false, failure: { reason: "invalid" } };

  if (key.expiresAt && new Date() > new Date(key.expiresAt)) {
    return { ok: false, failure: { reason: "expired" } };
  }

  // S1.5 IP allowlist: an allowlisted key used from another IP is rejected
  // (401, indistinguishable from an invalid key to the caller).
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (key.ipAllowlist?.length && clientIp && !key.ipAllowlist.includes(clientIp)) {
    return { ok: false, failure: { reason: "invalid" } };
  }

  // S1.5 anomaly: >200 uses in an hour is flagged (security event, and
  // the key is NOT silently killed — the owner decides from the dashboard).
  const recent = (key.recentUseCount ?? 0) + 1;
  if (recent > 200) {
    try {
      const { recordSecurityEvent } = await import("@/lib/security-events");
      await recordSecurityEvent({ teamId: key.teamId.toString(), type: "api_key_anomaly", metadata: { keyId: key._id.toString(), recentUseCount: recent } });
    } catch { /* best-effort */ }
  }

  // Update usage stats (non-blocking)
  ApiKeyModel.findByIdAndUpdate(key._id, {
    $inc: { usageCount: 1, recentUseCount: 1 },
    $set: { lastUsedAt: new Date(), lastUsedIpTruncated: clientIp ? clientIp.split(".").slice(0, 3).join(".") + ".0" : undefined },
  }).exec().catch(() => undefined);

  return {
    ok: true,
    session: {
      teamId: key.teamId.toString(),
      scopes: key.scopes ?? [],
      keyId: key._id.toString(),
      accessLevel: key.accessLevel ?? "read",
    },
  };
}

export function hasScope(session: ApiKeySession, required: string): boolean {
  return session.scopes.includes(required);
}

/** Generate a new API key pair: { rawKey (show once), keyHash (store) }. */
export function generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const rawKey = `pc_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyHash, prefix: rawKey.slice(0, 16) };
}

/**
 * Full gate for /api/v1/* routes: API key → scope → subscription → plan entitlement.
 * Returns the session or a NextResponse error to return early.
 * 401 = bad/missing/expired key, 403 = missing scope, 402 = plan limit / archived,
 * 429 = per-key rate limit exceeded.
 */
export async function requireV1Access(
  req: Request,
  scope: string
): Promise<{ session: ApiKeySession } | NextResponse> {
  const result = await validateApiKey(req);
  if (!result.ok) {
    const f = result.failure;
    if (f.reason === "rate_limited") {
      const retryAfter = Math.max(1, Math.ceil((f.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "API key rate limit exceeded", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const message =
      f.reason === "expired"
        ? "API key has expired"
        : "Unauthorized. Provide a valid API key in Authorization: Bearer <key>";
    return NextResponse.json(
      { error: message },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }
  const { session } = result;

  if (!hasScope(session, scope)) {
    return NextResponse.json({ error: `Forbidden. Missing scope: ${scope}` }, { status: 403 });
  }
  // S1.5: read-only keys can never perform a write, even with a write scope.
  if (scope.startsWith("write:") && session.accessLevel !== "write") {
    return NextResponse.json({ error: "Forbidden. This is a read-only API key." }, { status: 403 });
  }

  const { checkSubscription } = await import("@/lib/api-helpers");
  const block = await checkSubscription(session.teamId);
  if (block) return block;

  // Plan gate: API access is a Pro feature
  const { checkEntitlement } = await import("@/lib/entitlements");
  const ent = await checkEntitlement(session.teamId, "api.access");
  if ("response" in ent) return ent.response;

  return { session };
}

/** Log-safe key prefix for audit trails (never the full key). */
export function keyPrefixForLog(rawKey: string): string {
  return rawKey.slice(0, 12) + "…";
}
