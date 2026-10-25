"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { RFM_SEGMENTS, type RfmCustomer, type RfmSegment, type RfmSegments } from "@/lib/rfm";

type CustomerRow = Omit<RfmCustomer, "firstOrderDate" | "lastOrderDate"> & {
  firstOrderDate: string;
  lastOrderDate: string;
};

const SEGMENT_LABELS: Record<RfmSegment, string> = {
  champions: "Champions",
  loyal: "Loyal",
  new: "New",
  "at-risk": "At risk",
  lost: "Lost",
  regular: "Regular",
};

export function CustomersClient({
  customers,
  segments,
}: {
  customers: CustomerRow[];
  segments: RfmSegments;
}) {
  const [filter, setFilter] = useState<RfmSegment | "all">("all");
  const visible =
    filter === "all" ? customers : customers.filter((c) => c.segment === filter);
  const shown = visible.slice(0, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Customers
        </h1>
        <p className="text-muted-foreground">
          RFM segmentation from your real orders. Scores are relative quintiles
          within your own customer base, not absolute benchmarks. Cancelled
          orders and orders without an email are excluded.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RFM_SEGMENTS.map((segment) => {
          const s = segments[segment];
          return (
            <button
              key={segment}
              onClick={() => setFilter(filter === segment ? "all" : segment)}
              className="text-left"
            >
              <Card
                className={
                  filter === segment ? "ring-2 ring-primary" : undefined
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {SEGMENT_LABELS[segment]}
                    <Badge variant="secondary">{s.count}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-0.5">
                  <p>Revenue: {formatCurrency(s.totalRevenue)}</p>
                  <p>Profit: {formatCurrency(s.totalProfit)}</p>
                  <p>Avg recency: {s.avgRecencyDays.toFixed(0)} days</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "all" ? "Top customers by profit" : SEGMENT_LABELS[filter]}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers with an email on orders in the last 365 days yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Segment</th>
                  <th className="py-2 pr-3 text-right">Orders</th>
                  <th className="py-2 pr-3 text-right">Revenue</th>
                  <th className="py-2 pr-3 text-right">Profit</th>
                  <th className="py-2 pr-3 text-right">Recency</th>
                  <th className="py-2 pr-3 text-right">R / F / M</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.email} className="border-t">
                    <td className="py-2 pr-3 font-medium break-all">{c.email}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{SEGMENT_LABELS[c.segment]}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right">{c.orders}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(c.totalRevenue)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(c.totalProfit)}</td>
                    <td className="py-2 pr-3 text-right">{c.recencyDays}d</td>
                    <td className="py-2 pr-3 text-right">
                      {c.scoreR} / {c.scoreF} / {c.scoreM}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
