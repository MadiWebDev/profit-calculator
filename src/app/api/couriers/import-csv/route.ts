/**
 * POST /api/couriers/import-csv { csv } — Phase 6 CSV fallback for
 * shipment/tracking reports. Rows are parsed by courier.ts
 * parseShipmentCsv (bad rows are reported, never thrown); rows with a
 * tracking number upsert by (team, courier, trackingNumber), rows
 * without one are reported as errors because re-importing them would
 * silently duplicate shipments. Returns imported/updated counts plus
 * the parse errors with line numbers.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import ShipmentModel from "@/models/Shipment";
import { parseShipmentCsv } from "@/lib/courier";

const BodySchema = z.object({ csv: z.string().min(1).max(1_000_000) }).strict();

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "courier-csv");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;

  const { shipments, errors } = parseShipmentCsv(parsed.data.csv);
  await connectDB();
  const teamId = toObjectId(session.teamId);
  let imported = 0;
  let updated = 0;
  const importErrors = [...errors];
  for (const s of shipments) {
    if (!s.trackingNumber) {
      importErrors.push({ line: 0, reason: "missing tracking_number: row skipped (re-import would duplicate it)" });
      continue;
    }
    const res = await ShipmentModel.findOneAndUpdate(
      { teamId, courier: s.courier, trackingNumber: s.trackingNumber },
      {
        teamId,
        courier: s.courier,
        trackingNumber: s.trackingNumber,
        city: s.city,
        region: s.region,
        postalCode: s.postalCode,
        status: s.status,
        cost: s.cost,
        codAmount: s.codAmount,
        codCollected: s.codCollected,
        bookedAt: s.bookedAt,
        deliveredAt: s.deliveredAt,
        attempts: s.attempts,
        source: "csv",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // findOneAndUpdate with upsert does not tell us insert vs update
    // directly; createdAt == updatedAt on the returned doc is the
    // closest signal and is only used for the headline counts.
    if (res.createdAt.getTime() === res.updatedAt.getTime()) imported++;
    else updated++;
  }
  return NextResponse.json({ imported, updated, skipped: importErrors.length, errors: importErrors.slice(0, 100) });
}
