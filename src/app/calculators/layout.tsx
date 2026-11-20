import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";

// The calculators hub is a client component, so its metadata lives on
// this server layout. Without it the hub inherited the root layout's
// default title and description — a duplicate shared with 12 other
// pages (GSC: Crawled – currently not indexed candidate).
export const metadata: Metadata = buildMetadata({
  title: "Free Profit Calculators",
  description:
    "Free profit calculators for Shopify, Amazon FBA, dropshipping, ads, SaaS, real estate and food businesses. Instant net profit, margin and break-even answers.",
  path: "/calculators",
});

export default function CalculatorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
