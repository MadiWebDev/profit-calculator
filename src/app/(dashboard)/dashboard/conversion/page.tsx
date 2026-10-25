"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ParityReportPage } from "@/components/dashboard/ParityReportPage";

export default function ConversionPage() {
  const [tracking, setTracking] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/analytics/conversion")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setTracking(j ? Boolean(j.trackingEnabled) : null))
      .catch(() => setTracking(null));
  }, []);

  return (
    <div className="space-y-6">
      {tracking === false && (
        <Card><CardContent className="py-6 space-y-2">
          <p className="font-semibold">Conversion tracking is not enabled yet</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No funnel events have arrived. Connect the ShopifyQL import or install the pixel app extension —
            install steps are in the Manual Steps doc. Until then, profit below comes from orders only and
            visitor-based rates are 0, not guessed.
          </p>
          <Link href="/dashboard/report-guide#conversion" className="text-sm font-medium text-[var(--color-primary)] underline">
            How conversion tracking works →
          </Link>
        </CardContent></Card>
      )}
      <ParityReportPage
        title="Product Conversion"
        description="Views → add-to-cart → checkout → purchase per product and per traffic source, combined with profit: profit per visitor and a high-traffic, low-profit flag. Purchase events supply denominators only; revenue always comes from orders."
        apiPath="/api/analytics/conversion"
        metrics={[
          { key: "visitors", label: "Visitors", format: "number", tooltip: "Distinct funnel sessions in the period.", guideId: "visitors" },
          { key: "profitPerVisitor", label: "Profit per visitor", format: "money", tooltip: "Net profit divided by distinct visitors.", guideId: "profit-per-visitor" },
          { key: "netProfit", label: "Net profit", format: "money", tooltip: "Net revenue minus all costs.", guideId: "net-profit" },
          { key: "revenue", label: "Revenue", format: "money", tooltip: "Net revenue from orders.", guideId: "net-revenue" },
        ]}
        columns={[
          { key: "product", label: "Product", format: "text" },
          { key: "views", label: "Views", format: "number" },
          { key: "addToCart", label: "Add to cart", format: "number" },
          { key: "checkout", label: "Checkout", format: "number" },
          { key: "purchase", label: "Purchase", format: "number" },
          { key: "conversionRate", label: "Conversion", format: "percent" },
          { key: "revenue", label: "Revenue", format: "money" },
          { key: "grossProfit", label: "Gross profit", format: "money" },
          { key: "profitPerVisitor", label: "Profit / visitor", format: "money" },
          { key: "flag", label: "Flag", format: "text" },
        ]}
        rowKey="product"
        emptyTitle="No funnel events in this period. Enable conversion tracking to see views and conversion by product."
        emptyAction={{ label: "See install steps", href: "/dashboard/report-guide#conversion" }}
      />
    </div>
  );
}
