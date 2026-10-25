"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface CourierRow {
  courier: string; total: number; deliverySuccessRate: number; rtoRate: number;
  avgDeliveryDays: number; firstAttemptSuccessRate: number; costPerShipment: number;
  avgCodSettlementDays: number; exceptionRate: number;
}
interface CityRow extends CourierRow { city: string }
interface Ranked { courier: string; score: number; confidence: string; sample: number; metrics: CourierRow }
interface Recommend {
  recommendation: Ranked | null; ranked: Ranked[];
  insufficientData: { courier: string; sample: number }[];
  switchingProfitImpact: { eligible: boolean; bestCourier: string | null; extraProfitPerShipment: number; extraProfitPer100Shipments: number };
}

export function CouriersClient() {
  const [byCourier, setByCourier] = useState<CourierRow[]>([]);
  const [byCity, setByCity] = useState<CityRow[]>([]);
  const [couriers, setCouriers] = useState<{ id: string; name: string; hasApiKey: boolean }[]>([]);
  const [alerts, setAlerts] = useState<{ stuckCount: number; settlementDelayCount: number; highFailureAreas: { courier: string; city: string; rtoRate: number; total: number }[] } | null>(null);
  const [recommend, setRecommend] = useState<Recommend | null>(null);
  const [city, setCity] = useState("");
  const [newCourier, setNewCourier] = useState("");
  const [csv, setCsv] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, c, a] = await Promise.all([
        fetch("/api/couriers/metrics").then((r) => { if (!r.ok) throw new Error("metrics"); return r.json(); }),
        fetch("/api/couriers").then((r) => (r.ok ? r.json() : { couriers: [] })),
        fetch("/api/couriers/alerts").then((r) => (r.ok ? r.json() : null)),
      ]);
      setByCourier(m.byCourier ?? []);
      setByCity(m.byCity ?? []);
      setCouriers(c.couriers ?? []);
      setAlerts(a);
    } catch {
      setError("Could not load courier data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data load on mount; no SSR alternative for an authenticated fetch */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const askRecommend = async () => {
    if (!city.trim()) return;
    const r = await fetch(`/api/couriers/recommend?city=${encodeURIComponent(city.trim())}`);
    if (r.ok) setRecommend(await r.json());
  };

  const addCourier = async () => {
    if (!newCourier.trim()) return;
    const r = await fetch("/api/couriers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCourier.trim() }),
    });
    if (r.ok) { setNewCourier(""); setNotice("Courier added."); await load(); }
    else setNotice("Could not add courier (a courier with this name may already exist).");
  };

  const importCsv = async () => {
    if (!csv.trim()) return;
    const r = await fetch("/api/couriers/import-csv", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const j = await r.json();
    setNotice(r.ok ? `Imported ${j.imported}, updated ${j.updated}, skipped ${j.skipped}.` : "CSV import failed.");
    if (r.ok) await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Couriers</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Performance by courier and city, best-courier recommendations, and shipment alerts.
          No named courier API is connected yet — use CSV upload (tracking reports) until you add your couriers; the generic adapter normalises any status text.
        </p>
      </div>

      {error && <Card><CardContent className="py-6 text-center text-sm text-red-600">{error}</CardContent></Card>}
      {notice && <Card><CardContent className="py-3 text-sm">{notice}</CardContent></Card>}

      {alerts && (alerts.stuckCount > 0 || alerts.settlementDelayCount > 0 || alerts.highFailureAreas.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Alerts</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {alerts.stuckCount > 0 && <p>{alerts.stuckCount} shipment(s) stuck over 5 days in transit.</p>}
            {alerts.settlementDelayCount > 0 && <p>{alerts.settlementDelayCount} COD settlement(s) delayed over 7 days.</p>}
            {alerts.highFailureAreas.map((a, i) => (
              <p key={i}>{a.courier} in {a.city}: {a.rtoRate}% RTO over {a.total} shipments.</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Add courier</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={newCourier} onChange={(e) => setNewCourier(e.target.value)} placeholder="Courier name, e.g. TCS" />
            <Button onClick={addCourier}>Add</Button>
          </CardContent>
          <CardContent className="pt-0 text-xs text-[var(--color-muted-foreground)]">
            {couriers.length === 0 ? "No couriers yet." : couriers.map((c) => (
              <span key={c.id} className="mr-2"><Badge variant="outline">{c.name}</Badge></span>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Best courier for a city</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. Lahore" />
            <Button onClick={askRecommend}>Recommend</Button>
          </CardContent>
          {recommend && (
            <CardContent className="pt-0 text-sm space-y-1">
              {recommend.recommendation ? (
                <>
                  <p>Route via <strong>{recommend.recommendation.courier}</strong> (score {recommend.recommendation.score}, confidence {recommend.recommendation.confidence}, {recommend.recommendation.sample} shipments).</p>
                  {recommend.switchingProfitImpact.eligible && (
                    <p>Switching saves about {formatCurrency(recommend.switchingProfitImpact.extraProfitPerShipment)} per shipment ({formatCurrency(recommend.switchingProfitImpact.extraProfitPer100Shipments)} per 100).</p>
                  )}
                </>
              ) : (
                <p>No courier has the minimum 20 shipments for this city yet — recommendations need data, not guesses.</p>
              )}
              {recommend.insufficientData.length > 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)]">Too little data: {recommend.insufficientData.map((d) => `${d.courier} (${d.sample})`).join(", ")}</p>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Performance by courier</CardTitle></CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-[var(--color-muted-foreground)]" role="status">Loading…</p>}
          {!loading && byCourier.length === 0 && <p className="text-sm text-[var(--color-muted-foreground)]">No shipments yet. Import a CSV below to start measuring couriers.</p>}
          {byCourier.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <tr>{["Courier", "Shipments", "Delivery success", "RTO rate", "Avg days", "First-attempt", "Cost / shipment", "COD settlement days"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {byCourier.map((c) => (
                    <tr key={c.courier}>
                      <td className="px-4 py-2.5 font-medium">{c.courier}</td>
                      <td className="px-4 py-2.5">{c.total}</td>
                      <td className="px-4 py-2.5">{c.deliverySuccessRate}%</td>
                      <td className="px-4 py-2.5">{c.rtoRate}%</td>
                      <td className="px-4 py-2.5">{c.avgDeliveryDays}</td>
                      <td className="px-4 py-2.5">{c.firstAttemptSuccessRate}%</td>
                      <td className="px-4 py-2.5">{formatCurrency(c.costPerShipment)}</td>
                      <td className="px-4 py-2.5">{c.avgCodSettlementDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {byCity.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Performance by city</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                  <tr>{["Courier", "City", "Shipments", "Delivery success", "RTO rate", "Avg days", "Cost / shipment"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {byCity.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium">{c.courier}</td>
                      <td className="px-4 py-2.5">{c.city}</td>
                      <td className="px-4 py-2.5">{c.total}</td>
                      <td className="px-4 py-2.5">{c.deliverySuccessRate}%</td>
                      <td className="px-4 py-2.5">{c.rtoRate}%</td>
                      <td className="px-4 py-2.5">{c.avgDeliveryDays}</td>
                      <td className="px-4 py-2.5">{formatCurrency(c.costPerShipment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Import shipment CSV</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Columns: tracking_number, courier, city, region, postal_code, status, cost, cod_amount, cod_collected, booked_at, delivered_at, attempts.
            Bad rows are reported with line numbers; rows without a tracking number are skipped so re-imports never duplicate.
          </p>
          <textarea
            className="w-full min-h-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs font-mono"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"tracking_number,courier,city,region,postal_code,status,cost,cod_amount,cod_collected,booked_at,delivered_at,attempts\nTRK1,TCS,Lahore,Punjab,54000,delivered,12,200,true,2026-10-20,2026-10-22,1"}
          />
          <Button onClick={importCsv}>Import CSV</Button>
        </CardContent>
      </Card>
    </div>
  );
}
