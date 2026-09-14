import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates a single manual order.
// Body: {
//   orderNumber?, orderDate, status?,
//   grossRevenue, discounts?, shippingRevenue?, shippingCost?,
//   totalCogs?, transactionFees?, taxes?,
//   refundAmount?, chargebackAmount?, adSpendAllocated?,
//   customerEmail?, currency?
// }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string; role?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  // ── Validate required fields ───────────────────────────────────────────────
  const body = await req.json();
  const grossRevenue = Number(body.grossRevenue ?? 0);
  if (!body.orderDate) {
    return NextResponse.json({ error: "orderDate is required" }, { status: 422 });
  }
  const orderDate = new Date(body.orderDate);
  if (isNaN(orderDate.getTime())) {
    return NextResponse.json({ error: "orderDate is invalid" }, { status: 422 });
  }
  if (grossRevenue < 0) {
    return NextResponse.json({ error: "grossRevenue must be ≥ 0" }, { status: 422 });
  }

  // ── Parse optional numeric fields ─────────────────────────────────────────
  const discounts        = Math.max(0, Number(body.discounts        ?? 0));
  const shippingRevenue  = Math.max(0, Number(body.shippingRevenue  ?? 0));
  const shippingCost     = Math.max(0, Number(body.shippingCost     ?? 0));
  const totalCogs        = Math.max(0, Number(body.totalCogs        ?? 0));
  const transactionFees  = Math.max(0, Number(body.transactionFees  ?? 0));
  const taxes            = Math.max(0, Number(body.taxes            ?? 0));
  const refundAmount     = Math.max(0, Number(body.refundAmount     ?? 0));
  const chargebackAmount = Math.max(0, Number(body.chargebackAmount ?? 0));
  const adSpendAllocated = Math.max(0, Number(body.adSpendAllocated ?? 0));

  const currency     = typeof body.currency === "string" ? body.currency : "USD";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : undefined;
  const orderNumber  = typeof body.orderNumber === "string" ? body.orderNumber.trim() : undefined;
  const status       = (["pending", "fulfilled", "refunded", "cancelled"] as const).includes(body.status)
    ? body.status as "pending" | "fulfilled" | "refunded" | "cancelled"
    : "fulfilled";

  // ── Compute profit ─────────────────────────────────────────────────────────
  const profit = calcOrderProfit({
    grossRevenue, discounts, shippingRevenue, shippingCost,
    totalCogs, transactionFees, taxes, refundAmount,
    chargebackAmount, adSpendAllocated,
  });

  await connectDB();

  // Find or create the manual-entry store for this team
  let store = await StoreModel.findOne({ teamId: user.teamId, platform: "csv_manual", name: "Manual Entry" });
  if (!store) {
    store = await StoreModel.create({
      teamId: user.teamId,
      name: "Manual Entry",
      platform: "csv_manual",
      syncStatus: "idle",
      isActive: true,
    });
  }

  // Use a unique external ID for manual orders: timestamp + random suffix
  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const order = await OrderModel.create({
    storeId: store._id,
    teamId: user.teamId,
    externalId,
    orderNumber: orderNumber || externalId,
    orderDate,
    currency,
    grossRevenue, discounts,
    netRevenue: profit.netRevenue,
    totalCogs, shippingCost, shippingRevenue,
    transactionFees, taxes, refundAmount, chargebackAmount, adSpendAllocated,
    netProfit: profit.netProfit,
    profitMargin: profit.netMargin,
    customerEmail: customerEmail || undefined,
    status,
    importedFrom: "api",
  });

  await logAudit({
    teamId: new mongoose.Types.ObjectId(user.teamId),
    userId: new mongoose.Types.ObjectId(user.id!),
    action: "order.imported",
    description: `Created manual order ${orderNumber || externalId} — revenue $${grossRevenue}, net profit $${profit.netProfit}`,
    resourceType: "Order",
    resourceId: order._id.toString(),
    metadata: { grossRevenue, netProfit: profit.netProfit, status },
  });

  return NextResponse.json(
    {
      order: {
        id: order._id.toString(),
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate.toISOString(),
        status: order.status,
        grossRevenue: order.grossRevenue,
        netRevenue: order.netRevenue,
        totalCogs: order.totalCogs,
        netProfit: order.netProfit,
        profitMargin: order.profitMargin,
        adSpendAllocated: order.adSpendAllocated,
        refundAmount: order.refundAmount,
        customerEmail: order.customerEmail,
        itemCount: 0,
      },
    },
    { status: 201 }
  );
}
