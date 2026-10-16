import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { ProductsClient } from "./ProductsClient";

async function getProducts(teamId: string) {
  await connectDB();
  const products = await ProductModel.find({ teamId, isActive: true })
    .sort({ totalProfit: -1 })
    .limit(200)
    .lean();

  return products.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    sku: p.sku,
    defaultCogs: p.defaultCogs,
    totalRevenue: p.totalRevenue,
    totalCogs: p.totalCogs,
    totalProfit: p.totalProfit,
    totalOrders: p.totalOrders,
    avgProfitMargin: p.avgProfitMargin,
    imageUrl: p.imageUrl,
  }));
}

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const products = await getProducts(teamId);
  // role is available via RoleContext (injected by layout) — no need to pass explicitly
  return <ProductsClient products={products} />;
}
