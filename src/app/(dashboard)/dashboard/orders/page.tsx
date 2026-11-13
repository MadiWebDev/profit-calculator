import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { OrdersClient } from "./OrdersClient";
import { getTeamBaseCurrency } from "@/lib/reporting";
import { escapeRegExp, parsePageParam } from "@/lib/search";

async function getOrders(teamId: string, page: number, search: string) {
  await connectDB();
  const limit = 50;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { teamId };
  if (search) {
    // The term is a literal string, never a regex pattern: an unescaped
    // "[" (or "(", "\", …) throws MongoServerError and 500s the page.
    const escaped = escapeRegExp(search);
    query.$or = [
      { orderNumber: { $regex: escaped, $options: "i" } },
      { customerEmail: { $regex: escaped, $options: "i" } },
      { externalId: { $regex: escaped, $options: "i" } },
    ];
  }

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    OrderModel.countDocuments(query),
  ]);

  // An order with no stored currency is shown in the team's base
  // currency — never silently relabelled USD.
  const baseCurrency = await getTeamBaseCurrency(teamId);

  return {
    orders: orders.map((o) => ({
      id: o._id.toString(),
      externalId: o.externalId,
      orderNumber: o.orderNumber ?? o.externalId,
      orderDate: o.orderDate ? new Date(o.orderDate).toISOString() : new Date().toISOString(),
      status: o.status,
      currency: o.currency ?? baseCurrency,
      grossRevenue: o.grossRevenue ?? 0,
      discounts: o.discounts ?? 0,
      netRevenue: o.netRevenue ?? 0,
      totalCogs: o.totalCogs ?? 0,
      shippingRevenue: o.shippingRevenue ?? 0,
      shippingCost: o.shippingCost ?? 0,
      transactionFees: o.transactionFees ?? 0,
      taxes: o.taxes ?? 0,
      chargebackAmount: o.chargebackAmount ?? 0,
      netProfit: o.netProfit ?? 0,
      profitMargin: o.profitMargin ?? 0,
      adSpendAllocated: o.adSpendAllocated ?? 0,
      refundAmount: o.refundAmount ?? 0,
      customerEmail: o.customerEmail ?? "",
      itemCount: o.lineItems?.length ?? 0,
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  };
}

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function OrdersPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const params = await searchParams;
  // Invalid / out-of-range page values fall back to 1 instead of
  // reaching Mongo as skip(-50) (500) or rendering "Page NaN".
  const page = parsePageParam(params.page);
  const search = params.search ?? "";
  const data = await getOrders(teamId, page, search);

  return <OrdersClient data={data} />;
}
