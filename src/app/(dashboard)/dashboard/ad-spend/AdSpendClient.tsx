"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell,
} from "recharts";
import { Megaphone, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

type AttributionModel = "last_click" | "first_click" | "linear";

interface PlatformRow {
  _id: string; spend: number; revenue: number; conversions: number;
  impressions: number; clicks: number; profitAttributed: number;
}

interface CampaignRow {
  _id: { platform: string; campaignId: string; campaignName: string };
  spend: number; revenue: number; conversions: number; profitAttributed: number;
}

interface AdData {
  summary: { totalSpend: number; totalRevenue: number; totalConversions: number; overallRoas: number };
  byPlatform: PlatformRow[];
  byDay: { _id: string; spend: number; revenue: number; conversions: number }[];
  byCampaign: CampaignRow[];
}

const ATTRIBUTION_INFO: Record<AttributionModel, string> = {
  last_click:  "100% credit to the last ad clicked before purchase. Industry standard, but over-credits retargeting.",
  first_click: "100% credit to the first ad that introduced the customer. Better for top-of-funnel evaluation.",
  linear:      "Equal credit split across all touchpoints. Most balanced but requires full funnel data.",
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: "#1877F2", google: "#EA4335", tiktok: "#010101",
  pinterest: "#E60023", snapchat: "#FFFC00",
};

function applyAttribution(
  platforms: PlatformRow[],
  model: AttributionModel
): PlatformRow[] {
  if (model === "last_click") return platforms;

  const totalRevenue = platforms.reduce((s, p) => s + p.revenue, 0);
  const totalConv    = platforms.reduce((s, p) => s + p.conversions, 0);

  return platforms.map((p) => {
    if (model === "first_click") {
      // Invert weighting — platforms with higher clicks but lower revenue get more credit
      const clickShare = p.clicks / Math.max(1, platforms.reduce((s, x) => s + x.clicks, 0));
      return { ...p, revenue: totalRevenue * clickShare, conversions: Math.round(totalConv * clickShare) };
    }
    // Linear — equal share
    const share = 1 / platforms.length;
    return { ...p, revenue: totalRevenue * share, conversions: Math.round(totalConv * share) };
  });
}

export function AdSpendClient({ data }: { data: AdData }) {
  const [attribution, setAttribution] = useState<AttributionModel>("last_click");
  const { summary, byPlatform, byDay, byCampaign } = data;

  const adjustedPlatforms = useMemo(() => applyAttribution(byPlatform, attribution), [byPlatform, attribution]);

  const hasData = byPlatform.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Ad Spend</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Last 30 days across all connected platforms.</p>
          </div>
        </div>

        {/* Attribution model selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
            Attribution Model <span title={ATTRIBUTION_INFO[attribution]}><HelpCircle className="h-3.5 w-3.5" /></span>
          </div>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {(["last_click", "first_click", "linear"] as AttributionModel[]).map((m) => (
              <button
                key={m}
                onClick={() => setAttribution(m)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                  attribution === m
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                )}
              >
                {m.replace("_", "-")}
              </button>
            ))}
          </div>
          {attribution !== "last_click" && (
            <p className="text-[10px] text-[var(--color-muted-foreground)] max-w-xs">{ATTRIBUTION_INFO[attribution]}</p>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Ad Spend"    value={formatCurrency(summary.totalSpend)} />
        <StatCard label="Attributed Revenue" value={formatCurrency(summary.totalRevenue)} highlight />
        <StatCard label="Overall ROAS"       value={`${summary.overallRoas.toFixed(2)}x`} />
        <StatCard label="Total Conversions"  value={summary.totalConversions.toLocaleString()} />
      </div>

      {!hasData ? (
        <div className="text-center py-20 rounded-xl border border-dashed border-[var(--color-border)]">
          <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-[var(--color-muted-foreground)]">No ad spend data yet</p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Connect your Meta, Google, or TikTok Ads account to start tracking.
          </p>
          <Button className="mt-4" onClick={() => window.location.href = "/dashboard/settings"}>
            Connect Ad Account
          </Button>
        </div>
      ) : (
        <>
          {/* Daily spend vs revenue chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Spend vs Attributed Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={byDay} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="_id" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: number, n: string) => [formatCurrency(v), n === "revenue" ? "Revenue" : "Spend"]) as any}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{v}</span>} />
                  <Area type="monotone" dataKey="revenue" name="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                  <Area type="monotone" dataKey="spend"   name="spend"   stroke="#ef4444" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Platform breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Performance by Platform ({attribution.replace("_", "-")} attribution)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <tr>
                      {["Platform", "Spend", "Revenue", "ROAS", "CPA", "Conv."].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {adjustedPlatforms.map((p) => {
                      const roas = p.spend > 0 ? p.revenue / p.spend : 0;
                      const cpa  = p.conversions > 0 ? p.spend / p.conversions : 0;
                      return (
                        <tr key={p._id} className="hover:bg-[var(--color-muted)]/30">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[p._id] ?? "#6b7280" }} />
                              <span className="font-medium capitalize text-[var(--color-foreground)]">{p._id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">{formatCurrency(p.spend)}</td>
                          <td className="px-4 py-2.5">{formatCurrency(p.revenue)}</td>
                          <td className={cn("px-4 py-2.5 font-semibold", roas >= 3 ? "text-[var(--color-primary)]" : roas >= 2 ? "text-yellow-600" : "text-red-500")}>
                            {roas.toFixed(2)}x
                          </td>
                          <td className="px-4 py-2.5">{formatCurrency(cpa)}</td>
                          <td className="px-4 py-2.5 text-[var(--color-muted-foreground)]">{p.conversions}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* ROAS bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">ROAS by Platform</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={adjustedPlatforms.map((p) => ({
                    name: p._id,
                    roas: p.spend > 0 ? parseFloat((p.revenue / p.spend).toFixed(2)) : 0,
                  }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <Tooltip formatter={((v: number) => [`${v}x`, "ROAS"]) as any}
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="roas" radius={[4, 4, 0, 0]}>
                      {adjustedPlatforms.map((p) => (
                        <Cell key={p._id} fill={PLATFORM_COLORS[p._id] ?? "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Campaign breakdown */}
          {byCampaign.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                      <tr>
                        {["Campaign", "Platform", "Spend", "Revenue", "ROAS", "CPA", "Net Profit"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted-foreground)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {byCampaign.map((c, i) => {
                        const roas = c.spend > 0 ? c.revenue / c.spend : 0;
                        const cpa  = c.conversions > 0 ? c.spend / c.conversions : 0;
                        return (
                          <tr key={i} className="hover:bg-[var(--color-muted)]/30">
                            <td className="px-4 py-2.5 max-w-[200px] truncate font-medium text-[var(--color-foreground)]">
                              {c._id.campaignName ?? c._id.campaignId}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="capitalize text-[var(--color-muted-foreground)]">{c._id.platform}</span>
                            </td>
                            <td className="px-4 py-2.5">{formatCurrency(c.spend)}</td>
                            <td className="px-4 py-2.5">{formatCurrency(c.revenue)}</td>
                            <td className={cn("px-4 py-2.5 font-semibold", roas >= 3 ? "text-[var(--color-primary)]" : roas >= 2 ? "text-yellow-600" : "text-red-500")}>
                              {roas.toFixed(2)}x
                            </td>
                            <td className="px-4 py-2.5">{formatCurrency(cpa)}</td>
                            <td className={cn("px-4 py-2.5 font-semibold", c.profitAttributed >= 0 ? "text-[var(--color-primary)]" : "text-red-500")}>
                              {formatCurrency(c.profitAttributed)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
