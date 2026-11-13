import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import ProductModel from "@/models/Product";
import { ProductsClient } from "./ProductsClient";
import { getTeamBaseCurrency } from "@/lib/reporting";
import { getComputedProductAggregates } from "@/lib/product-aggregates-server";
import {
  emptyProductAggregate,
  lookupProductAggregate,
} from "@/lib/product-aggregates";

async function getProducts(teamId: string) {
  await connectDB();
  const products = await ProductModel.find({ teamId, isActive: true })
    .limit(200)
    .lean();

  // A product with no stored currency is shown in the team's base
  // currency — never silently relabelled USD.
  const baseCurrency = await getTeamBaseCurrency(teamId);

  // The stored Product aggregates (totalRevenue/totalOrders/…) are
  // never written anywhere, so they are always 0 — compute them from
  // the team's orders at read time instead (see
  // src/lib/product-aggregates.ts). The stored fields stay in the
  // model as a fallback but are no longer read for display.
  const { aggregates } = await getComputedProductAggregates(teamId);

  const withAggregates = products.map((p) => {
    const agg =
      lookupProductAggregate(aggregates, {
        externalId: p.externalId,
        sku: p.sku,
        name: p.name,
      }) ?? emptyProductAggregate(p._id.toString(), p.name);
    return {
      id: p._id.toString(),
      name: p.name,
      currency: p.currency ?? baseCurrency,
      sku: p.sku,
      defaultCogs: p.defaultCogs,
      totalRevenue: agg.totalRevenue,
      totalCogs: agg.totalCogs,
      totalProfit: agg.totalProfit,
      totalOrders: agg.totalOrders,
      avgProfitMargin: agg.avgProfitMargin,
      imageUrl: p.imageUrl,
    };
  });

  // Sort by COMPUTED profit (the old DB sort on the stored, always-0
  // totalProfit was meaningless).
  withAggregates.sort((a, b) => b.totalProfit - a.totalProfit);
  return withAggregates;
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
