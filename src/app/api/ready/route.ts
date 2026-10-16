import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * GET /api/ready — readiness probe.
 * Returns 200 only when the app can serve traffic (MongoDB reachable).
 * Redis is optional — reported but not gating.
 * Used by: orchestrators before routing traffic, deploy smoke checks.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};
  let ready = true;

  // MongoDB (required)
  const mongoStart = Date.now();
  try {
    await connectDB();
    const state = mongoose.connection.readyState; // 1 = connected
    checks.mongodb = { ok: state === 1, latencyMs: Date.now() - mongoStart };
    if (state !== 1) ready = false;
  } catch (err) {
    ready = false;
    checks.mongodb = {
      ok: false,
      latencyMs: Date.now() - mongoStart,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  // Redis (optional — never gates readiness)
  const redisStart = Date.now();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      // Raw REST ping — same pattern as src/lib/rate-limit.ts (no SDK dependency)
      const res = await fetch(`${redisUrl.replace(/\/$/, "")}/ping`, {
        headers: { authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(5000),
      });
      checks.redis = { ok: res.ok, latencyMs: Date.now() - redisStart };
    } catch (err) {
      checks.redis = {
        ok: false,
        latencyMs: Date.now() - redisStart,
        detail: err instanceof Error ? err.message : "unknown",
      };
    }
  } else {
    checks.redis = { ok: true, detail: "not configured (optional)" };
  }

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
