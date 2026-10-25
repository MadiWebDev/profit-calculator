"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ENTRIES: { id: string; term: string; definition: string; formula: string; example: string; mistakes: string; answers: string }[] = [
  { id: "net-revenue", term: "Net revenue", definition: "What customers actually paid, after refunds. Gross revenue is tax-exclusive and already net of discounts.", formula: "grossRevenue − refundAmount − chargebackAmount", example: "Gross 1,000, refunds 100 → net revenue 900.", mistakes: "Subtracting discounts again — they are already inside gross revenue.", answers: "How much did we really sell?" },
  { id: "net-profit", term: "Net profit", definition: "Net revenue minus every merchant cost: COGS, shipping, transaction fees, ad spend, packaging, COD fees, RTO loss, subscription share, expense allocation and other costs.", formula: "netRevenue − totalCogs − shippingCost − transactionFees − adSpendAllocated − otherCosts", example: "Net revenue 900, costs 600 → net profit 300.", mistakes: "Treating taxes collected as a cost — taxes are pass-through to the government.", answers: "Did we actually make money?" },
  { id: "net-margin", term: "Net margin", definition: "Net profit as a share of net revenue.", formula: "netProfit / netRevenue × 100", example: "300 / 900 = 33.33%.", mistakes: "Comparing margins across periods with different refund levels without noting it.", answers: "How efficient is each sale?" },
  { id: "orders", term: "Orders", definition: "Non-cancelled orders in the period. Cancelled orders are never sales, so they are excluded everywhere.", formula: "count(orders where status ≠ cancelled)", example: "10 orders, 1 cancelled → 9 counted.", mistakes: "Including cancelled orders inflates revenue and hides the real margin.", answers: "How many real sales?" },
  { id: "aov", term: "Average order value (AOV)", definition: "Net revenue per counted order.", formula: "netRevenue / orderCount", example: "900 / 9 = 100.", mistakes: "Using gross revenue (before refunds) overstates AOV.", answers: "How much is each order worth?" },
  { id: "refunds", term: "Refunds / chargebacks", definition: "Money returned to customers. Reduces net revenue, not a cost line.", formula: "refundAmount + chargebackAmount", example: "Refunds 80 + chargebacks 20 = 100.", mistakes: "Recording a refund as a cost and also subtracting it from revenue — double counting.", answers: "How much are we giving back?" },
  { id: "rto-rate", term: "RTO rate", definition: "Share of orders with an RTO loss recorded (returned to origin).", formula: "orders with rtoLoss > 0 / orderCount × 100", example: "2 of 20 orders RTO → 10%.", mistakes: "Confusing RTO with refunds — an RTO also loses shipping and packaging.", answers: "How often do deliveries fail?" },
  { id: "visitors", term: "Visitors", definition: "Distinct funnel sessions (anonymous session keys) that generated a view event.", formula: "count(distinct sessionKey where step = view)", example: "1,000 sessions viewed → 1,000 visitors.", mistakes: "Counting views as visitors — one visitor can view many times.", answers: "How much traffic did we get?" },
  { id: "profit-per-visitor", term: "Profit per visitor", definition: "Net profit divided by distinct visitors. The single number that combines traffic and profitability.", formula: "netProfit / visitors", example: "Net profit 300 / 1,000 visitors = 0.30 per visitor.", mistakes: "Using gross profit instead of net profit — ad spend and fees matter here.", answers: "Is our traffic profitable?" },
  { id: "conversion", term: "Conversion rate", definition: "Purchases divided by views, per product or source.", formula: "purchase events / view events × 100", example: "20 purchases / 1,000 views = 2%.", mistakes: "Comparing conversion across products with different traffic quality without noting source.", answers: "Which products turn traffic into sales?" },
  { id: "attribution", term: "Attribution", definition: "Ad spend is allocated to orders by UTM campaign where present; unattributed spend is reported separately, never silently spread.", formula: "order.adSpendAllocated (from UTM campaign) + unattributed pool", example: "Campaign A spend 500, orders with utmCampaign=A carry that spend.", mistakes: "Spreading unattributed spend evenly — it hides which campaigns actually work.", answers: "Which campaigns make money?" },
  { id: "cogs", term: "COGS", definition: "Cost of goods sold per unit, from Shopify cost, a manual rule, CSV import, or supplier sync. Missing COGS overstates profit.", formula: "sum(lineItem.cogs × quantity)", example: "2 units × 10 cost = 20 COGS.", mistakes: "Leaving COGS at 0 for new products — profit looks perfect until it isn't.", answers: "What did the products cost us?" },
];

export default function ReportGuidePage() {
  const [q, setQ] = useState("");
  const filtered = ENTRIES.filter((e) =>
    (e.term + e.definition + e.formula + e.answers).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Report Guide</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Every metric, its formula, an example, and the common mistake. Every metric tooltip on every report page links here.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="guide-search">Search metrics</Label>
        <Input id="guide-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. net profit, AOV, RTO…" />
      </div>
      <div>
        <h2 className="font-semibold mb-2">Which report answers which question?</h2>
        <ul className="text-sm space-y-1 list-disc pl-5 text-[var(--color-muted-foreground)]">
          <li>How much did we make today, and what needs doing now? → Mission Control</li>
          <li>When do we sell best? → Revenue By Date (day-of-week and hour patterns)</li>
          <li>Where should we stop advertising? → Country Analysis</li>
          <li>Which products waste traffic? → Product Conversion (high traffic, low profit)</li>
          <li>What is eating our profit? → Profit Leak Detector</li>
          <li>What do we owe and what did we spend to run the business? → P&amp;L Report, Monthly Expenses, Other Fees</li>
        </ul>
      </div>
      {filtered.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No metrics match that search. Try “profit”, “margin”, or “AOV”.</p>}
      {filtered.map((e) => (
        <Card key={e.id} id={e.id} className="scroll-mt-24">
          <CardHeader className="pb-1"><CardTitle>{e.term}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{e.definition}</p>
            <p><strong>Formula:</strong> <code>{e.formula}</code></p>
            <p><strong>Example:</strong> {e.example}</p>
            <p><strong>Common mistake:</strong> {e.mistakes}</p>
            <p className="text-[var(--color-muted-foreground)]"><strong>Answers:</strong> {e.answers}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
