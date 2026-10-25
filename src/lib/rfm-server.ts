/**
 * Server bridge for RFM segmentation (thin wrapper over the pure
 * module in `@/lib/rfm`, per decision D6). Shared by the RFM API
 * route's page counterpart so the dashboard renders server-side.
 */
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { segmentCustomers, type RfmOrderInput, type RfmResult } from "@/lib/rfm";

const KNOWN_STATUSES = new Set(["pending", "fulfilled", "refunded", "cancelled"]);

export async function getRfm(
  teamId: string,
  opts: { from?: Date; to?: Date; storeId?: string }
): Promise<RfmResult> {
  await connectDB();
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);

  const match: Record<string, unknown> = {
    teamId,
    orderDate: { $gte: from, $lte: to },
  };
  if (opts.storeId) match.storeId = opts.storeId;

  const orders = await OrderModel.find(match)
    .select("customerEmail orderDate netRevenue netProfit status isFirstOrder")
    .lean();

  const inputs: RfmOrderInput[] = orders
    .filter((o) => KNOWN_STATUSES.has(o.status))
    .map((o) => ({
      customerEmail: o.customerEmail ?? null,
      orderDate: o.orderDate,
      netRevenue: o.netRevenue ?? 0,
      netProfit: o.netProfit ?? 0,
      status: o.status as RfmOrderInput["status"],
      isFirstOrder: o.isFirstOrder,
    }));

  return segmentCustomers(inputs, to);
}
