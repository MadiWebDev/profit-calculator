import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProductIntel } from "@/lib/product-intel-server";
import { ProductIntelClient } from "./ProductIntelClient";

export default async function ProductIntelPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  const data = await getProductIntel(teamId, { from, to, targetMargin: 0.25 });

  return <ProductIntelClient products={data.products} movers={data.movers} />;
}
