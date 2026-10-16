import { NextResponse } from "next/server";

/**
 * GET /api/health — liveness probe.
 * Returns 200 when the process is up. No dependencies checked (use /api/ready).
 * Used by: Docker HEALTHCHECK, load balancers, uptime monitors.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "getprofitcalc",
      version: process.env.npm_package_version ?? "unknown",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
