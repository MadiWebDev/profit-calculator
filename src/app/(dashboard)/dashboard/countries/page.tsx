"use client";

import { ParityReportPage } from "@/components/dashboard/ParityReportPage";

export default function CountriesPage() {
  return (
    <ParityReportPage
      title="Country Analysis"
      description="Revenue, margin, refund and RTO rates, shipping and ad cost per shipping country. Click a column header to sort. Countries with negative margin carry a suggested action in the API response and in the drill-down below — drill into a country by city on the API with ?country=Name."
      apiPath="/api/analytics/countries"
      metrics={[
        { key: "revenue", label: "Revenue", format: "money", tooltip: "Net revenue: gross revenue minus refunds and chargebacks.", guideId: "net-revenue" },
        { key: "netProfit", label: "Net profit", format: "money", tooltip: "Net revenue minus all costs, including shipping and ad spend.", guideId: "net-profit" },
        { key: "netMargin", label: "Net margin", format: "percent", tooltip: "Net profit divided by net revenue.", guideId: "net-margin" },
        { key: "orderCount", label: "Orders", format: "number", tooltip: "Non-cancelled orders in the period.", guideId: "orders" },
        { key: "aov", label: "AOV", format: "money", tooltip: "Net revenue divided by orders.", guideId: "aov" },
        { key: "rtoRate", label: "RTO rate", format: "percent", tooltip: "Share of orders with an RTO loss recorded.", guideId: "rto-rate" },
      ]}
      columns={[
        { key: "country", label: "Country", format: "text" },
        { key: "orderCount", label: "Orders", format: "number" },
        { key: "revenue", label: "Revenue", format: "money" },
        { key: "netProfit", label: "Net profit", format: "money" },
        { key: "netMargin", label: "Margin", format: "percent" },
        { key: "aov", label: "AOV", format: "money" },
        { key: "refundRate", label: "Refund rate", format: "percent" },
        { key: "rtoRate", label: "RTO rate", format: "percent" },
        { key: "shippingCost", label: "Shipping cost", format: "money" },
        { key: "adSpend", label: "Ad spend", format: "money" },
      ]}
      rowKey="country"
      emptyTitle="No orders with a shipping country in this period. Connect your store or import orders to see country analysis."
      emptyAction={{ label: "Connect a store", href: "/dashboard/settings?tab=stores" }}
    />
  );
}
