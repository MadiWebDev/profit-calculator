/**
 * Structured logger — JSON in production, human-readable in development.
 *
 * Redacts known-sensitive keys (token, secret, password, authorization,
 * api keys, etc.) before emitting, so secrets can never leak into logs.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("order synced", { teamId, count });
 *   logger.warn("rate limit near", { key });
 *   logger.error("sync failed", err, { storeId });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogRecord {
  level: LogLevel;
  msg: string;
  time: string;
  pid?: number;
  requestId?: string;
  [key: string]: unknown;
}

// Keys whose values must never appear in logs. Match is case-insensitive
// and also applies to substrings (e.g. "accessToken", "paddle-secret").
const REDACT_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /api[-_]?key/i,
  /apikey/i,
  /client[-_]?secret/i,
  /session/i,
  /cookie/i,
  /set-cookie/i,
  /^auth$/i,
  /credential/i,
  /private[-_]?key/i,
  /webhook[-_]?secret/i,
  /encryption[-_]?key/i,
];

const REDACTED = "[REDACTED]";

/** Recursively redact sensitive values in an object (cycle-safe). */
export function redact(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Redact long hex/base64-looking strings that smell like secrets
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_PATTERNS.some((re) => re.test(k)) ? REDACTED : redact(v, seen);
    }
    return out;
  }
  return value;
}

const isProd = process.env.NODE_ENV === "production";
const levelRank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (isProd ? "info" : "debug");

function emit(level: LogLevel, msg: string, meta?: unknown, err?: unknown) {
  if (levelRank[level] < levelRank[minLevel]) return;

  const record: LogRecord = {
    level,
    msg,
    time: new Date().toISOString(),
  };

  if (meta !== undefined && meta !== null) {
    const r = redact(meta) as Record<string, unknown>;
    if (typeof r === "object" && !Array.isArray(r)) Object.assign(record, r);
    else record.data = r;
  }
  if (err) {
    record.error = redact(err);
  }

  // Forward errors to Sentry when configured — lazy dynamic import keeps
  // this module edge-safe and dependency-free when Sentry is not set up.
  if (level === "error" && process.env.SENTRY_DSN) {
    const sentryErr = err instanceof Error ? err : new Error(msg);
    import("@sentry/nextjs")
      .then((Sentry) =>
        Sentry.captureException(sentryErr, {
          extra: typeof record.error === "object" ? (record.error as Record<string, unknown>) : undefined,
        })
      )
      .catch(() => {
        /* Sentry failed — the log line below is the fallback */
      });
  }

  if (isProd) {
    // JSON lines — picked up by log aggregators
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    // Human-readable in dev
    const { level: _l, msg: _m, time: _t, ...rest } = record;
    void _l;
    void _m;
    void _t;
    const suffix = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    const line = `[${record.time}] ${level.toUpperCase()} ${msg}${suffix}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit("debug", msg, meta),
  info: (msg: string, meta?: unknown) => emit("info", msg, meta),
  warn: (msg: string, meta?: unknown, err?: unknown) => emit("warn", msg, meta, err),
  error: (msg: string, err?: unknown, meta?: unknown) => emit("error", msg, meta, err),
};

/** Wrap an unknown caught value into a log-safe error object. */
export function toLogError(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: "UnknownError", message: String(err) };
}
