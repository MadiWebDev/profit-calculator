"use client";

import { useState } from "react";
import { PackageSearch, TrendingUp, TrendingDown, Sparkles, Skull } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { ProductIntelRow } from "@/lib/product-intel-server";
import type { ProductMover } from "@/lib/product-intel";

function money(n: number) {
  return formatCurrency(n);
}

export function ProductIntelClient({
  products,
  movers,
}: {
  products: ProductIntelRow[];
  movers: ProductMover[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? products : products.slice(0, 20);

  const rising = movers.filter((m) => m.trend === "rising" || m.trend === "new");
  const falling = movers.filter((m) => m.trend === "falling" || m.trend === "dead");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageSearch className="h-6 w-6" /> Product Intelligence
        </h1>
        <p className="text-muted-foreground">
          Fully-loaded profit per product (revenue minus COGS minus allocated
          shipping, fees, ad spend and other costs), break-even price at a 25%
          target margin, and 30-day movers — all from your real orders.
          Cancelled orders are excluded.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Rising &amp; new
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {rising.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing rising in the last 30 days.</p>
            )}
            {rising.slice(0, 8).map((m) => (
              <p key={m.key} className="text-sm flex justify-between gap-2">
                <span className="truncate">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.trend === "new" ? "new" : `+${m.pctChange?.toFixed(0) ?? 0}%`} ·{" "}
                  {m.recentUnits} units
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4" /> Falling &amp; dead
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {falling.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing falling in the last 30 days.</p>
            )}
            {falling.slice(0, 8).map((m) => (
              <p key={m.key} className="text-sm flex justify-between gap-2">
                <span className="truncate">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.trend === "dead" ? "no sales" : `${m.pctChange?.toFixed(0) ?? 0}%`} ·{" "}
                  {m.recentUnits} units
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profit ranking &amp; pricing</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products with orders in the last 90 days yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">Units</th>
                  <th className="py-2 pr-3 text-right">Revenue</th>
                  <th className="py-2 pr-3 text-right">Loaded profit</th>
                  <th className="py-2 pr-3 text-right">Margin</th>
                  <th className="py-2 pr-3 text-right">Break-even</th>
                  <th className="py-2 pr-3 text-right">Price for 25%</th>
                  <th className="py-2 pr-3 text-right">Max discount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.key} className="border-t">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{p.name}</span>
                      {p.fullyLoadedProfit < 0 && (
                        <Badge variant="destructive" className="ml-2">
                          Losing money
                        </Badge>
                      )}
                      {p.breakEven.maxDiscountPct <= 0 && p.avgPrice > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          Priced below break-even
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{p.units}</td>
                    <td className="py-2 pr-3 text-right">{money(p.revenue)}</td>
                    <td className="py-2 pr-3 text-right">{money(p.fullyLoadedProfit)}</td>
                    <td className="py-2 pr-3 text-right">
                      {formatPercent(p.fullyLoadedMargin)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {money(p.breakEven.breakEvenPrice)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {money(p.breakEven.priceForMargin)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatPercent(p.breakEven.maxDiscountPct * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {products.length > 20 && (
            <button
              className="mt-3 text-sm font-medium underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show top 20" : `Show all ${products.length}`}
            </button>
          )}
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Allocated costs are split across an
            order&apos;s lines by revenue share; break-even adds per-unit
            shipping, fees, ad spend and other costs to COGS.{" "}
            <Skull className="h-3 w-3" /> &ldquo;Max discount&rdquo; is headroom
            below the current average price before hitting break-even.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
