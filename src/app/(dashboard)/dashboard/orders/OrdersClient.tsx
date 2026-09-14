"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface OrderRow {
  id: string;
  externalId: string;
  orderNumber?: string;
  orderDate: string;
  status: string;
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  netProfit: number;
  profitMargin: number;
  adSpendAllocated: number;
  refundAmount: number;
  customerEmail?: string;
  itemCount: number;
}

interface OrdersData {
  orders: OrderRow[];
  total: number;
  pages: number;
  page: number;
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    fulfilled: "success",
    pending: "outline",
    refunded: "warning",
    cancelled: "destructive",
  };
  return (
    <Badge variant={(map[status] ?? "outline") as "success" | "outline" | "warning" | "destructive"} className="capitalize text-xs">
      {status}
    </Badge>
  );
};

export function OrdersClient({ data }: { data: OrdersData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useCurrency();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [isPending, startTransition] = useTransition();

  const goSearch = (q: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (q) p.set("search", q); else p.delete("search");
    p.set("page", "1");
    startTransition(() => router.push(`/dashboard/orders?${p.toString()}`));
  };

  const goPage = (pg: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(pg));
    startTransition(() => router.push(`/dashboard/orders?${p.toString()}`));
  };

  const exportCSV = () => {
    const headers = ["Order #", "Date", "Status", "Revenue", "COGS", "Net Profit", "Margin %", "Ad Spend", "Refund"];
    const rows = data.orders.map((o) => [
      o.orderNumber ?? o.externalId,
      new Date(o.orderDate).toLocaleDateString(),
      o.status,
      o.grossRevenue.toFixed(2),
      o.totalCogs.toFixed(2),
      o.netProfit.toFixed(2),
      o.profitMargin.toFixed(2),
      o.adSpendAllocated.toFixed(2),
      o.refundAmount.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "orders.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Orders</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{data.total.toLocaleString()} orders total</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              className="pl-9 w-64"
              placeholder="Search orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goSearch(search)}
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
              <tr>
                {["Order", "Date", "Status", "Revenue", "COGS", "Net Profit", "Margin", "Ad Spend"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-[var(--color-border)]", isPending && "opacity-60")}>
              {data.orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-muted-foreground)] text-sm">
                    No orders found. Import orders via CSV or connect a store.
                  </td>
                </tr>
              )}
              {data.orders.map((order) => (
                <tr key={order.id} className="hover:bg-[var(--color-muted)]/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--color-foreground)] whitespace-nowrap">
                    #{order.orderNumber ?? order.externalId}
                    {order.customerEmail && (
                      <p className="text-xs text-[var(--color-muted-foreground)] font-normal">{order.customerEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)] whitespace-nowrap">
                    {new Date(order.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3 text-[var(--color-foreground)]">{formatCurrency(order.grossRevenue, currency)}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{formatCurrency(order.totalCogs, currency)}</td>
                  <td className={cn("px-4 py-3 font-semibold", order.netProfit >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                    {formatCurrency(order.netProfit, currency)}
                  </td>
                  <td className={cn("px-4 py-3 font-medium", order.profitMargin >= 20 ? "text-green-600 dark:text-green-400" : order.profitMargin >= 10 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500")}>
                    {formatPercent(order.profitMargin)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{formatCurrency(order.adSpendAllocated, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--color-muted-foreground)]">
          <p>Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => goPage(data.page - 1)} disabled={data.page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => goPage(data.page + 1)} disabled={data.page >= data.pages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
