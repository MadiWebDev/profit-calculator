/**
 * Phase 6 server bridge: DB documents <-> pure courier.ts functions,
 * plus the profit write-back when a shipment reaches a terminal state.
 *
 * Profit write-back rule (documented, conservative):
 * - delivered: the linked order's shippingCost becomes the shipment's
 *   actual cost, and netProfit is recomputed with calcTrueNetProfit
 *   from the order's stored fields.
 * - returned_rto: the linked order's rtoLoss becomes shipment cost +
 *   packaging cost, and netProfit is recomputed the same way.
 * - Orders with taxMode "inclusive" are NOT recomputed: the stored
 *   order has no tax rate, so recomputation could silently change the
 *   tax-exclusive revenue. Their shippingCost/rtoLoss fields are still
 *   updated; the P&L page notes the limitation.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import ShipmentModel, { type IShipment } from "@/models/Shipment";
import OrderModel from "@/models/Order";
import type { ShipmentInput } from "@/lib/courier";
import { calcTrueNetProfit } from "@/lib/profit-extended";

export function toShipmentInput(doc: IShipment): ShipmentInput {
  return {
    courier: doc.courier,
    city: doc.city,
    region: doc.region,
    postalCode: doc.postalCode,
    status: doc.status,
    cost: doc.cost ?? 0,
    codAmount: doc.codAmount ?? 0,
    codCollected: doc.codCollected ?? false,
    codSettledAt: doc.codSettledAt,
    bookedAt: doc.bookedAt,
    deliveredAt: doc.deliveredAt,
    attempts: doc.attempts ?? 1,
    createdAt: doc.createdAt,
  };
}

export async function loadTeamShipments(teamId: string): Promise<ShipmentInput[]> {
  await connectDB();
  const docs = await ShipmentModel.find({ teamId: new mongoose.Types.ObjectId(teamId) }).lean();
  return docs.map((d) => toShipmentInput(d as unknown as IShipment));
}

/**
 * Apply a shipment's terminal status to its linked order. Returns
 * true when an order was updated. Never throws for a missing order —
 * the shipment itself is the record of truth.
 */
export async function applyShipmentToOrder(shipmentId: string, teamId: string): Promise<boolean> {
  await connectDB();
  const shipment = await ShipmentModel.findOne({
    _id: shipmentId,
    teamId: new mongoose.Types.ObjectId(teamId),
  });
  if (!shipment || !shipment.orderId) return false;
  const order = await OrderModel.findOne({
    _id: shipment.orderId,
    teamId: new mongoose.Types.ObjectId(teamId),
  });
  if (!order) return false;

  let changed = false;
  if (shipment.status === "delivered") {
    order.shippingCost = shipment.cost ?? 0;
    order.fulfillmentStatus = "delivered";
    if (shipment.trackingNumber) order.trackingNumber = shipment.trackingNumber;
    order.trackingCompany = shipment.courier;
    changed = true;
  } else if (shipment.status === "returned_rto") {
    order.rtoLoss = (shipment.cost ?? 0) + (order.packagingCost ?? 0);
    order.fulfillmentStatus = "returned";
    changed = true;
  }
  if (!changed) return false;

  if (order.taxMode !== "inclusive") {
    const breakdown = calcTrueNetProfit({
      grossRevenue: order.grossRevenue ?? 0,
      discounts: order.discounts ?? 0,
      shippingRevenue: order.shippingRevenue ?? 0,
      shippingCost: order.shippingCost ?? 0,
      totalCogs: order.totalCogs ?? 0,
      transactionFees: order.transactionFees ?? 0,
      taxes: order.taxes ?? 0,
      refundAmount: order.refundAmount ?? 0,
      chargebackAmount: order.chargebackAmount ?? 0,
      adSpendAllocated: order.adSpendAllocated ?? 0,
      otherCosts: order.otherCosts ?? 0,
      packagingCost: order.packagingCost ?? 0,
      codFee: order.codFee ?? 0,
      subscriptionShare: order.subscriptionShare ?? 0,
      rtoLoss: order.rtoLoss ?? 0,
      expenseAllocation: order.expenseAllocation ?? 0,
      taxMode: order.taxMode,
    });
    order.netProfit = breakdown.netProfit;
    order.profitMargin = breakdown.netMargin;
  }
  await order.save();
  return true;
}
