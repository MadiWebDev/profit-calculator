import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import { OrdersClient } from "./OrdersClient";

async function getOrders(teamId: string, page: number, search: string) {
  await connectDB();
  const limit = 50;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { teamId };
  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { customerEmail: { $regex: search, $options: "i" } },
      { externalId: { $regex: search, $options: "i" } },
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

  return {
    orders: orders.map((o) => ({
      id: o._id.toString(),
      externalId: o.externalId,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate.toISOString(),
      status: o.status,
      grossRevenue: o.grossRevenue,
      netRevenue: o.netRevenue,
      totalCogs: o.totalCogs,
      netProfit: o.netProfit,
      profitMargin: o.profitMargin,
      adSpendAllocated: o.adSpendAllocated,
      refundAmount: o.refundAmount,
      customerEmail: o.customerEmail,
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
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search ?? "";
  const data = await getOrders(teamId, page, search);

  return <OrdersClient data={data} />;
}
