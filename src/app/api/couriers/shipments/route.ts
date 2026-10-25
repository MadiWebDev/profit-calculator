/**
 * GET /api/couriers/shipments — team shipments, filterable by status,
 * city and courier, paginated. POST — manually create a shipment,
 * optionally linked to a team order (the link must belong to the
 * caller's team). Phase 6.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseQuery, parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import ShipmentModel from "@/models/Shipment";
import OrderModel from "@/models/Order";
import { normalizeShipmentStatus } from "@/lib/courier";

const QuerySchema = z
  .object({
    status: z.string().optional(),
    city: z.string().optional(),
    courier: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const CreateSchema = z
  .object({
    courier: z.string().trim().min(1).max(100),
    trackingNumber: z.string().trim().max(100).default(""),
    city: z.string().trim().max(100).default(""),
    region: z.string().trim().max(100).default(""),
    postalCode: z.string().trim().max(20).default(""),
    status: z.string().min(1),
    cost: z.number().min(0).default(0),
    codAmount: z.number().min(0).default(0),
    codCollected: z.boolean().default(false),
    bookedAt: z.string().optional(),
    deliveredAt: z.string().optional(),
    attempts: z.number().int().min(0).default(1),
    orderId: z.string().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "shipments");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = parseQuery(req, QuerySchema);
  if ("response" in parsed) return parsed.response;
  const { status, city, courier, page, limit } = parsed.data;
  await connectDB();
  const filter: Record<string, unknown> = { teamId: toObjectId(session.teamId) };
  if (status) filter.status = status;
  if (city) filter.city = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (courier) filter.courier = courier;
  const [rows, total] = await Promise.all([
    ShipmentModel.find(filter).sort({ bookedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ShipmentModel.countDocuments(filter),
  ]);
  return NextResponse.json({
    shipments: rows.map((s) => ({ ...s, id: s._id.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "shipments-post");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, CreateSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;
  const status = normalizeShipmentStatus(d.status);
  if (!status) {
    return NextResponse.json({ error: `Unknown shipment status: ${d.status}`, code: "BAD_REQUEST" }, { status: 400 });
  }
  await connectDB();
  let orderOid;
  if (d.orderId) {
    if (!/^[a-f0-9]{24}$/i.test(d.orderId)) {
      return NextResponse.json({ error: "Invalid orderId", code: "BAD_REQUEST" }, { status: 400 });
    }
    const order = await OrderModel.findOne({ _id: d.orderId, teamId: toObjectId(session.teamId) }).select("_id").lean();
    if (!order) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }
    orderOid = order._id;
  }
  const created = await ShipmentModel.create({
    teamId: toObjectId(session.teamId),
    ...(orderOid ? { orderId: orderOid } : {}),
    courier: d.courier,
    trackingNumber: d.trackingNumber,
    city: d.city,
    region: d.region,
    postalCode: d.postalCode,
    status,
    cost: d.cost,
    codAmount: d.codAmount,
    codCollected: d.codCollected,
    bookedAt: d.bookedAt ? new Date(d.bookedAt) : new Date(),
    deliveredAt: d.deliveredAt ? new Date(d.deliveredAt) : undefined,
    attempts: d.attempts,
    source: "manual",
  });
  return NextResponse.json({ id: created._id.toString(), status }, { status: 201 });
}
