/**
 * Rate limiter — Upstash Redis when UPSTASH_REDIS_REST_URL is set,
 * in-process fallback for local/single-instance deploys.
 *
 * The Redis path is ATOMIC: a single Lua script does INCR + conditional
 * EXPIRE + TTL read in one round trip, so concurrent requests can't race
 * the window setup.
 *
 * Presets:
 *   RATE_LIMIT_PRESETS = { auth, strict, standard, lenient }
 * Use `withRateLimit(req, preset, key)` in routes, or the lower-level
 * `rateLimit(key, { max, windowMs })`.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  limit: number;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export const RATE_LIMIT_PRESETS: Record<string, RateLimitOptions> = {
  // Login / register / password reset — per IP + per email, strict
  auth:     { max: 10,  windowMs: 10 * 60 * 1000 },
  // Billing, API keys, imports — sensitive + expensive
  strict:   { max: 30,  windowMs: 60 * 1000 },
  // Default API usage
  standard: { max: 100, windowMs: 60 * 1000 },
  // Public read APIs (blog)
  lenient:  { max: 300, windowMs: 60 * 1000 },
};

// ── Atomic Redis implementation ──────────────────────────────────────────────
// Genuinely atomic: a single Lua script (one EVAL round trip) does
// INCR + conditional EXPIRE + TTL read. No separate EXPIRE request, so a
// key can never be left without a TTL and concurrent requests can't race
// the window setup.

const RATE_LIMIT_LUA = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`.trim();

async function rateLimitRedis(
  identifier: string,
  { max, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const key   = `rl:${identifier}`;
  const now   = Date.now();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // Upstash REST /eval: body is [script, numkeys, key, ...argv]
    const evalRes = await fetch(`${url}/eval`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([RATE_LIMIT_LUA, "1", key, String(windowSec)]),
    });
    if (!evalRes.ok) throw new Error(`Upstash HTTP ${evalRes.status}`);

    const data = (await evalRes.json()) as { result?: [number, number]; error?: string };
    if (data.error) throw new Error(`Upstash EVAL: ${data.error}`);
    const [count, ttl] = data.result ?? [];
    if (typeof count !== "number" || typeof ttl !== "number") {
      throw new Error("Upstash EVAL returned no result");
    }

    const resetAt = now + (ttl > 0 ? ttl * 1000 : windowMs);
    return { ok: count <= max, remaining: Math.max(0, max - count), resetAt, limit: max };
  } catch {
    return rateLimitMemory(identifier, { max, windowMs });
  }
}

// ── In-memory fallback ───────────────────────────────────────────────────────

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

function rateLimitMemory(
  identifier: string,
  { max, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  let entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(identifier, entry);
  }

  entry.count++;
  const remaining = Math.max(0, max - entry.count);

  // Probabilistic cleanup to avoid unbounded memory growth
  if (Math.random() < 0.001) {
    for (const [k, v] of store.entries()) {
      if (now > v.resetAt) store.delete(k);
    }
  }

  return { ok: entry.count <= max, remaining, resetAt: entry.resetAt, limit: max };
}

// ── Public API ───────────────────────────────────────────────────────────────

const useRedis =
  typeof process.env.UPSTASH_REDIS_REST_URL === "string" &&
  process.env.UPSTASH_REDIS_REST_URL.length > 0;

export function rateLimit(
  identifier: string,
  options?: Partial<RateLimitOptions>
): Promise<RateLimitResult> | RateLimitResult {
  const opts: RateLimitOptions = {
    max: options?.max ?? parseInt(process.env.API_RATE_LIMIT_MAX ?? "100", 10),
    windowMs: options?.windowMs ?? parseInt(process.env.API_RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  };
  if (useRedis) return rateLimitRedis(identifier, opts);
  return rateLimitMemory(identifier, opts);
}

/** Rate limit with a named preset. */
export function rateLimitPreset(
  identifier: string,
  preset: keyof typeof RATE_LIMIT_PRESETS
): Promise<RateLimitResult> | RateLimitResult {
  return rateLimit(identifier, RATE_LIMIT_PRESETS[preset]);
}

/** Extract a stable rate-limit key from an HTTP request */
export function getRateLimitKey(req: Request, suffix = ""): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return `${ip}:${suffix}`;
}

/** Client IP for per-IP buckets. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Route helper — returns a 429 NextResponse when the preset is exceeded,
 * otherwise null. Sets X-RateLimit-* and Retry-After headers.
 */
export async function withRateLimit(
  req: Request,
  preset: keyof typeof RATE_LIMIT_PRESETS,
  keySuffix: string
): Promise<Response | null> {
  const { NextResponse } = await import("next/server");
  const key = getRateLimitKey(req, keySuffix);
  const rl = await Promise.resolve(rateLimitPreset(key, preset));
  if (rl.ok) return null;
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(rl.resetAt),
        "Retry-After": String(retryAfter),
      },
    }
  );
}
