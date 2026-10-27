"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { ParityReportPage } from "@/components/dashboard/ParityReportPage";

export default function RevenueByDatePage() {
  const [granularity, setGranularity] = useState("daily");
  return (
    <ParityReportPage
      title="Revenue By Date"
      description="Revenue, orders, AOV, net profit and refunds by day, week or month. Net profit uses the same formula as True Profit, so this page's totals match Profit Trends and the P&L for the same period (before the P&L's separate ad-dashboard spend line — see the Report Guide)."
      apiPath="/api/analytics/revenue-by-date"
      extraParams={{ granularity }}
      extraFilters={
        <div className="space-y-1">
          <Label htmlFor="granularity">Group by</Label>
          <select id="granularity" value={granularity} onChange={(e) => setGranularity(e.target.value)} className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      }
      metrics={[
        { key: "revenue", label: "Revenue", format: "money", tooltip: "Net revenue: gross revenue minus refunds and chargebacks.", guideId: "net-revenue" },
        { key: "netProfit", label: "Net profit", format: "money", tooltip: "Net revenue minus COGS, shipping, fees, ad spend and other costs.", guideId: "net-profit" },
        { key: "netMargin", label: "Net margin", format: "percent", tooltip: "Net profit divided by net revenue.", guideId: "net-margin" },
        { key: "orderCount", label: "Orders", format: "number", tooltip: "Non-cancelled orders in the period.", guideId: "orders" },
        { key: "aov", label: "AOV", format: "money", tooltip: "Net revenue divided by orders.", guideId: "aov" },
        { key: "refunds", label: "Refunds", format: "money", tooltip: "Refunds plus chargebacks in the period.", guideId: "refunds" },
      ]}
      columns={[
        { key: "key", label: "Date", format: "text" },
        { key: "orderCount", label: "Orders", format: "number" },
        { key: "revenue", label: "Revenue", format: "money" },
        { key: "refunds", label: "Refunds", format: "money" },
        { key: "cogs", label: "COGS", format: "money" },
        { key: "netProfit", label: "Net profit", format: "money" },
        { key: "netMargin", label: "Margin", format: "percent" },
        { key: "aov", label: "AOV", format: "money" },
      ]}
      rowKey="key"
      emptyTitle="No orders in this period. Connect your Shopify store or import orders to see revenue by date."
      emptyAction={{ label: "Connect a store", href: "/dashboard/settings?tab=stores" }}
    />
  );
}
