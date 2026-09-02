import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";
import { calcOrderProfit } from "@/lib/profit-engine";
import { logAudit } from "@/lib/audit";
import Papa from "papaparse";
import mongoose from "mongoose";

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const storeName = (formData.get("storeName") as string) || "CSV Import";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const text = await file.text();
    const { data, errors } = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (!data.length) return NextResponse.json({ error: "CSV is empty or malformed" }, { status: 400 });

    await connectDB();

    // Find or create the CSV store
    let store = await StoreModel.findOne({ teamId: user.teamId, platform: "csv_manual", name: storeName });
    if (!store) {
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

        await OrderModel.findOneAndUpdate(
          { storeId: store._id, externalId },
          {
            storeId: store._id,
            teamId: user.teamId,
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
            customerEmail: row.customer_email ?? row.email,
            status: (row.status ?? "fulfilled") as "fulfilled" | "pending" | "refunded" | "cancelled",
            importedFrom: "csv",
          },
          { upsert: true }
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
    console.error("CSV import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
