/**
 * GET /api/couriers/recommend?city=&region= — Phase 6 "best courier
 * for this place" + "route this order via X".
 *
 * Returns the ranking for the destination (couriers below the 20-
 * shipment minimum sample are listed separately as insufficientData
 * and are never recommended), the top recommendation, and the profit
 * impact of switching. lostCostPerRto defaults to the destination's
 * current average cost per shipment — the shipping cost lost on an
 * RTO when no packaging figure is supplied — and is reported in the
 * response so the estimate is auditable.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { loadTeamShipments } from "@/lib/courier-server";
import { rankCouriersForDestination, switchingProfitImpact } from "@/lib/courier";

const QuerySchema = z
  .object({
    city: z.string().optional(),
    region: z.string().optional(),
    minSample: z.coerce.number().int().min(1).max(500).default(20),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "courier-recommend");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { city = "", region = "", minSample } = parsed.data;
  if (!city && !region) {
    return NextResponse.json({ error: "city or region is required", code: "BAD_REQUEST" }, { status: 400 });
  }
  const shipments = await loadTeamShipments(session.teamId);
  const ranking = rankCouriersForDestination(shipments, city, region, { minSample });
  const scoped = shipments.filter(
    (s) =>
      (city ? s.city.trim().toLowerCase() === city.trim().toLowerCase() : true) &&
      (!city && region ? s.region.trim().toLowerCase() === region.trim().toLowerCase() : true)
  );
  const currentAvgCost =
    scoped.length > 0 ? scoped.reduce((sum, s) => sum + s.cost, 0) / scoped.length : 0;
  const currentRtoRate =
    scoped.length > 0
      ? (scoped.filter((s) => s.status === "returned_rto").length / scoped.length) * 100
      : 0;
  // switchingProfitImpact is city-scoped by design; for a region-only
  // query the same formula is applied over the region's shipments.
  const impact = city
    ? switchingProfitImpact(shipments, city, currentAvgCost, { minSample })
    : (() => {
        const best = ranking.ranked[0];
        if (!best) {
          return {
            eligible: false, bestCourier: null,
            currentCostPerShipment: Math.round(currentAvgCost * 100) / 100,
            bestCostPerShipment: 0, currentRtoRate: Math.round(currentRtoRate * 100) / 100,
            bestRtoRate: 0, extraProfitPerShipment: 0, extraProfitPer100Shipments: 0,
          };
        }
        const extra =
          Math.round(
            (currentAvgCost - best.metrics.costPerShipment +
              ((currentRtoRate - best.metrics.rtoRate) / 100) * currentAvgCost) * 100
          ) / 100;
        return {
          eligible: true, bestCourier: best.courier,
          currentCostPerShipment: Math.round(currentAvgCost * 100) / 100,
          bestCostPerShipment: best.metrics.costPerShipment,
          currentRtoRate: Math.round(currentRtoRate * 100) / 100,
          bestRtoRate: best.metrics.rtoRate,
          extraProfitPerShipment: extra,
          extraProfitPer100Shipments: Math.round(extra * 100 * 100) / 100,
        };
      })();
  return NextResponse.json({
    city,
    region,
    minSample,
    recommendation: ranking.ranked[0] ?? null,
    ranked: ranking.ranked,
    insufficientData: ranking.insufficientData,
    switchingProfitImpact: impact,
    lostCostPerRtoAssumption: currentAvgCost,
  });
}
