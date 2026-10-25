/**
 * PATCH /api/couriers/shipments/[id] — update a shipment's status
 * (and COD settlement). When the new status is delivered or
 * returned_rto, the linked order's cost/rtoLoss and net profit are
 * updated via applyShipmentToOrder (see courier-server.ts for the
 * exact rule and its inclusive-tax limitation). Phase 6.
 */
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import ShipmentModel from "@/models/Shipment";
import { normalizeShipmentStatus } from "@/lib/courier";
import { applyShipmentToOrder } from "@/lib/courier-server";

const BodySchema = z
  .object({
    status: z.string().min(1).optional(),
    codSettledAt: z.string().optional(),
    deliveredAt: z.string().optional(),
    attempts: z.number().int().min(0).optional(),
    cost: z.number().min(0).optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await withRateLimit(req, "standard", "shipment-patch");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid shipment id", code: "BAD_REQUEST" }, { status: 400 });
  }
  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;
  await connectDB();
  const shipment = await ShipmentModel.findOne({ _id: id, teamId: toObjectId(session.teamId) });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found", code: "NOT_FOUND" }, { status: 404 });
  }
  if (d.status) {
    const status = normalizeShipmentStatus(d.status);
    if (!status) {
      return NextResponse.json({ error: `Unknown shipment status: ${d.status}`, code: "BAD_REQUEST" }, { status: 400 });
    }
    shipment.status = status;
    if (status === "delivered" && !shipment.deliveredAt) shipment.deliveredAt = new Date();
  }
  if (d.codSettledAt) shipment.codSettledAt = new Date(d.codSettledAt);
  if (d.deliveredAt) shipment.deliveredAt = new Date(d.deliveredAt);
  if (d.attempts !== undefined) shipment.attempts = d.attempts;
  if (d.cost !== undefined) shipment.cost = d.cost;
  await shipment.save();
  const orderUpdated = await applyShipmentToOrder(shipment._id.toString(), session.teamId);
  // Phase 9a: courier-manual status changes also notify (dedup in
  // sendOrderNotification prevents a second message when a Shopify
  // fulfillment webhook already notified this stage).
  if (shipment.orderId && (shipment.status === "out_for_delivery" || shipment.status === "delivered")) {
    const notifyEvent = shipment.status === "delivered" ? "delivered" : "out_for_delivery";
    const orderIdForNotify = shipment.orderId.toString();
    const teamIdForNotify = session.teamId;
    after(async () => {
      try {
        const { sendOrderNotification } = await import("@/lib/notify-server");
        await sendOrderNotification(orderIdForNotify, teamIdForNotify, notifyEvent);
      } catch {
        // Notification failure never fails the shipment update.
      }
    });
  }
  return NextResponse.json({ id: shipment._id.toString(), status: shipment.status, orderUpdated });
}
