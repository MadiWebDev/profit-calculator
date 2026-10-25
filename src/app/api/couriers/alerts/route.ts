/**
 * GET /api/couriers/alerts — Phase 6 stuck shipments (>5 days in
 * transit / out for delivery), high-failure areas (city RTO rate
 * >= 20% with >= 20 shipments), and COD settlement delays (>7 days
 * after delivery, cash collected but not settled).
 */
import { NextResponse } from "next/server";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { withRateLimit } from "@/lib/rate-limit";
import { loadTeamShipments } from "@/lib/courier-server";
import { stuckShipments, settlementDelays, cityMetrics } from "@/lib/courier";

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "courier-alerts");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const shipments = await loadTeamShipments(session.teamId);
  const now = new Date();
  const stuck = stuckShipments(shipments, now, 5);
  const delays = settlementDelays(shipments, now, 7);
  const { byCity } = cityMetrics(shipments);
  const highFailureAreas = byCity.filter((c) => c.total >= 20 && c.rtoRate >= 20);
  return NextResponse.json({
    stuckShipments: stuck.slice(0, 50).map((s) => ({
      courier: s.courier, city: s.city, status: s.status, bookedAt: s.bookedAt,
    })),
    stuckCount: stuck.length,
    settlementDelays: delays.slice(0, 50).map((s) => ({
      courier: s.courier, city: s.city, codAmount: s.codAmount, deliveredAt: s.deliveredAt,
    })),
    settlementDelayCount: delays.length,
    highFailureAreas: highFailureAreas.map((c) => ({
      courier: c.courier, city: c.city, rtoRate: c.rtoRate, total: c.total,
    })),
  });
}
