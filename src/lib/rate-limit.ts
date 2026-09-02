/**
 * Rate limiter — uses Upstash Redis when UPSTASH_REDIS_REST_URL is set,
 * falls back to an in-process store for local/single-instance deploys.
 *
 * Upstash free tier: https://upstash.com
 * Add to .env.local:
 *   UPSTASH_REDIS_REST_URL=https://...
 *   UPSTASH_REDIS_REST_TOKEN=...
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

const MAX    = parseInt(process.env.API_RATE_LIMIT_MAX       ?? "100", 10);
const WINDOW = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS ?? "60000", 10);

// ── Upstash Redis implementation ─────────────────────────────────────────────

async function rateLimitRedis(identifier: string): Promise<RateLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const key   = `rl:${identifier}`;
  const now   = Date.now();
  const windowSec = Math.ceil(WINDOW / 1000);

  try {
    // INCR + EXPIRE in a single pipeline for atomicity
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["TTL",  key],
      ]),
    });

    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data: [{ result: number }, { result: number }] = await res.json();
    const count = data[0].result;
    const ttl   = data[1].result;

    // Set expiry only on first request in the window
    if (count === 1) {
      await fetch(`${url}/expire/${key}/${windowSec}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    const resetAt   = now + (ttl > 0 ? ttl * 1000 : WINDOW);
    const remaining = Math.max(0, MAX - count);
    return { ok: count <= MAX, remaining, resetAt };
  } catch (err) {
    console.error("[rate-limit] Redis error, falling back to in-memory:", err);
    return rateLimitMemory(identifier);
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

function rateLimitMemory(identifier: string): RateLimitResult {
  const now = Date.now();
  let entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW };
    store.set(identifier, entry);
  }

  entry.count++;
  const remaining = Math.max(0, MAX - entry.count);

  // Probabilistic cleanup to avoid unbounded memory growth
  if (Math.random() < 0.001) {
    for (const [k, v] of store.entries()) {
      if (now > v.resetAt) store.delete(k);
    }
  }

  return { ok: entry.count <= MAX, remaining, resetAt: entry.resetAt };
}

// ── Public API ────────────────────────────────────────────────────────────────

const useRedis =
  typeof process.env.UPSTASH_REDIS_REST_URL === "string" &&
  process.env.UPSTASH_REDIS_REST_URL.length > 0;

export function rateLimit(identifier: string): Promise<RateLimitResult> | RateLimitResult {
  if (useRedis) return rateLimitRedis(identifier);
  return rateLimitMemory(identifier);
}

/** Extract a stable rate-limit key from an HTTP request */
export function getRateLimitKey(req: Request, suffix = ""): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return `${ip}:${suffix}`;
}
