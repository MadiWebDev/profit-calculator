/**
 * GET /api/couriers/metrics — Phase 6 performance tables.
 * Per-courier aggregates, per-courier-per-city and per-courier-per-
 * region tables, all from courier.ts over the team's shipments.
 */
import { NextResponse } from "next/server";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { withRateLimit } from "@/lib/rate-limit";
import { loadTeamShipments } from "@/lib/courier-server";
import { courierMetrics, cityMetrics } from "@/lib/courier";

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "courier-metrics");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const shipments = await loadTeamShipments(session.teamId);
  const { byCity, byRegion } = cityMetrics(shipments);
  return NextResponse.json({
    totalShipments: shipments.length,
    byCourier: courierMetrics(shipments),
    byCity,
    byRegion,
  });
}
