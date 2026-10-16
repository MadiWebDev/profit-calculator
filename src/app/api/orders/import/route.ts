import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { checkSubscription } from "@/lib/api-helpers";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";
import Papa from "papaparse";
import mongoose from "mongoose";

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "strict", "orders-import");
  if (rl) return rl;

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const storeName = (formData.get("storeName") as string) || "CSV Import";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const text = await file.text();
    const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });
    if (parseErrors.length > 0) {
      logger.warn("CSV import: parse errors detected", {
        teamId: user.teamId,
        count: parseErrors.length,
        first: parseErrors[0]?.message,
      });
    }

    if (!data.length) return NextResponse.json({ error: "CSV is empty or malformed" }, { status: 400 });
    if (data.length > 50_000) return NextResponse.json({ error: "CSV exceeds 50,000 rows" }, { status: 413 });

    await connectDB();

    // Plan limit: monthly orders (counted conservatively by row count)
    const orderEnt = await checkEntitlement(user.teamId, "orders.import", { count: data.length });
    if ("response" in orderEnt) return orderEnt.response;

    // Find or create the CSV store
    let store = await StoreModel.findOne({ teamId: user.teamId, platform: "csv_manual", name: storeName });
    if (!store) {
      const storeEnt = await checkEntitlement(user.teamId, "stores.connect");
      if ("response" in storeEnt) return storeEnt.response;
      store = await StoreModel.create({
        teamId: user.teamId,
        name: storeName,
        platform: "csv_manual",
        syncStatus: "idle",
        isActive: true,
      });
    }

    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      try {
        const externalId = String(row.order_id ?? row.id ?? row.order_number ?? "").trim();
        if (!externalId) { skipped++; continue; }

        const orderDate = new Date(row.order_date ?? row.date ?? Date.now());
        if (isNaN(orderDate.getTime())) { skipped++; continue; }

        const grossRevenue    = parseNum(row.gross_revenue ?? row.revenue ?? row.sale_price);
        const discounts       = parseNum(row.discounts ?? row.discount);
        const shippingRevenue = parseNum(row.shipping_revenue ?? row.shipping_charged);
        const shippingCost    = parseNum(row.shipping_cost ?? row.fulfillment_cost);
        const totalCogs       = parseNum(row.cogs ?? row.cost_of_goods ?? row.product_cost);
        const transactionFees = parseNum(row.transaction_fees ?? row.fees ?? row.payment_fees);
        const taxes           = parseNum(row.taxes ?? row.tax);
        const refundAmount    = parseNum(row.refund_amount ?? row.refund);
        const chargebackAmount = parseNum(row.chargeback_amount ?? row.chargeback);
        const adSpendAllocated = parseNum(row.ad_spend_allocated ?? row.ad_spend);

        const profit = calcOrderProfit({
          grossRevenue, discounts, shippingRevenue, shippingCost,
          totalCogs, transactionFees, taxes, refundAmount,
          chargebackAmount, adSpendAllocated,
        });

        const teamOid = new mongoose.Types.ObjectId(user.teamId);
        await OrderModel.findOneAndUpdate(
          { teamId: teamOid, storeId: store._id, externalId },
          {
            $set: {
              storeId: store._id,
              teamId: new mongoose.Types.ObjectId(user.teamId),
              externalId,
              orderNumber: row.order_number ?? externalId,
              orderDate,
              currency: row.currency ?? "USD",
              grossRevenue, discounts,
              netRevenue: profit.netRevenue,
              totalCogs, shippingCost, shippingRevenue,
              transactionFees, taxes, refundAmount, chargebackAmount, adSpendAllocated,
              netProfit: profit.netProfit,
              profitMargin: profit.netMargin,
              customerEmail: row.customer_email ?? row.email ?? undefined,
              status: (["fulfilled","pending","refunded","cancelled"].includes(
                (row.status ?? "").trim().toLowerCase()
              )
                ? (row.status as string).trim().toLowerCase()
                : "fulfilled") as "fulfilled" | "pending" | "refunded" | "cancelled",
              importedFrom: "csv",
            },
          },
          { upsert: true, new: true }
        );
        imported++;
      } catch {
        skipped++;
      }
    }

    // Update store order count
    await StoreModel.findByIdAndUpdate(store._id, { $inc: { ordersCount: imported }, syncStatus: "idle", lastSyncAt: new Date() });

    await logAudit({
      teamId: new mongoose.Types.ObjectId(user.teamId),
      userId: new mongoose.Types.ObjectId(user.id!),
      action: "order.imported",
      description: `Imported ${imported} orders via CSV into store "${storeName}"`,
      metadata: { imported, skipped },
    });

    return NextResponse.json({ imported, errors: skipped });
  } catch (err) {
    logger.error("CSV import failed", toLogError(err), { teamId: user.teamId });
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
