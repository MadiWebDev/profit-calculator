"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Ship,
  Search,
  Truck,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

interface ShipmentItem {
  id: string;
  courier: string;
  trackingNumber: string;
  city: string;
  region: string;
  status: string;
  cost: number;
  codAmount: number;
  codCollected: boolean;
  bookedAt?: string;
  deliveredAt?: string;
  attempts: number;
  orderId?: string;
}

export function ShipmentsClient() {
  const { formatMoney, baseCurrency } = useCurrency();
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("city", search.trim());

      const res = await fetch(`/api/couriers/shipments?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load shipments");
      const json = await res.json();
      setShipments(json.shipments ?? []);
      setTotal(json.total ?? 0);
      setPages(json.pages ?? 1);
    } catch {
      setError("Could not load shipments. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial load */
  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const deliveredCount = shipments.filter((s) => s.status === "delivered").length;
  const inTransitCount = shipments.filter((s) => ["in_transit", "out_for_delivery", "booked"].includes(s.status)).length;
  const rtoCount = shipments.filter((s) => ["rto", "returned"].includes(s.status)).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <Badge variant="success" className="capitalize text-xs">Delivered</Badge>;
      case "in_transit":
        return <Badge variant="warning" className="capitalize text-xs">In Transit</Badge>;
      case "out_for_delivery":
        return <Badge variant="warning" className="capitalize text-xs">Out For Delivery</Badge>;
      case "rto":
      case "returned":
        return <Badge variant="destructive" className="capitalize text-xs">RTO / Returned</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="capitalize text-xs">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="capitalize text-xs">{status.replace("_", " ")}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-[var(--color-foreground)]">
            <Ship className="h-6 w-6 text-[var(--color-primary)]" />
            Shipments & Tracking
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Track courier performance, delivery statuses, COD collections, and RTO returns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/couriers">
            <Button variant="outline" size="sm" className="gap-2">
              <Truck className="h-4 w-4" /> Courier Analytics →
            </Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={fetchShipments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Total Recorded</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">Delivered</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-green-600">{deliveredCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">In Transit / Active</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-500">{inTransitCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-[var(--color-muted-foreground)]">RTO / Returned</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-500">{rtoCount}</CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by city or destination..."
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="">All Statuses</option>
              <option value="delivered">Delivered</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="rto">RTO</option>
              <option value="returned">Returned</option>
              <option value="failed">Failed Attempt</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading shipment records...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchShipments}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : shipments.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-muted)] flex items-center justify-center mx-auto text-2xl">
              📦
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-base text-[var(--color-foreground)]">No shipments found</p>
              <p className="text-sm text-[var(--color-muted-foreground)] max-w-md mx-auto">
                {statusFilter || search
                  ? "No shipments match your current search filters. Try clearing them to see all records."
                  : "Shipments imported from your courier accounts or uploaded via CSV will appear here with live tracking, delivery rates, and COD settlement status."}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              {(statusFilter || search) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("");
                    setSearch("");
                  }}
                >
                  Clear Filters
                </Button>
              )}
              <Link href="/dashboard/couriers">
                <Button size="sm">Manage Couriers & CSV</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-xs text-[var(--color-muted-foreground)] font-medium">
                <tr>
                  <th className="py-3 px-4">Tracking #</th>
                  <th className="py-3 px-4">Courier</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Shipping Cost</th>
                  <th className="py-3 px-4">COD Value</th>
                  <th className="py-3 px-4">Booked Date</th>
                  <th className="py-3 px-4">Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--color-muted)]/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-xs">
                      {s.trackingNumber || <span className="text-[var(--color-muted-foreground)]">—</span>}
                    </td>
                    <td className="py-3 px-4 font-medium capitalize">{s.courier}</td>
                    <td className="py-3 px-4 text-[var(--color-muted-foreground)]">
                      {s.city ? `${s.city}${s.region ? `, ${s.region}` : ""}` : "—"}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(s.status)}</td>
                    <td className="py-3 px-4 font-medium">{formatMoney(s.cost, baseCurrency)}</td>
                    <td className="py-3 px-4">
                      {s.codAmount > 0 ? (
                        <span className={s.codCollected ? "text-green-600 font-medium" : "text-amber-500 font-medium"}>
                          {formatMoney(s.codAmount, baseCurrency)} {s.codCollected ? "(Settled)" : "(Pending)"}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">Prepaid</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--color-muted-foreground)]">
                      {s.bookedAt ? new Date(s.bookedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--color-muted-foreground)]">
                      {s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                Page {page} of {pages} ({total} total shipments)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
