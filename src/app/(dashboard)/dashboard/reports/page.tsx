"use client";

import { useState } from "react";
import { FileText, Download, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatPercent } from "@/lib/utils";

const REPORT_TYPES = [
  { id: "profit_summary", label: "Profit Summary", desc: "Revenue, COGS, net profit, and margins by period" },
  { id: "order_detail",   label: "Order Detail",   desc: "Per-order profit breakdown with all cost components" },
  { id: "product_margin", label: "Product Margins",desc: "SKU-level profit margin analysis" },
  { id: "ad_spend",       label: "Ad Spend ROI",   desc: "ROAS, CPA, and profit by campaign and ad creative" },
  { id: "tax_estimate",   label: "Tax Estimate",   desc: "Quarterly tax set-aside estimate based on net profit" },
];

export default function ReportsPage() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<string | null>(null);

  const download = async (type: string) => {
    setLoading(type);
    try {
      const res = await fetch(`/api/reports?type=${type}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profitcalc-${type}-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Reports & Export</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Download branded CSV reports for accountants, investors, or your records.</p>
        </div>
      </div>

      {/* Date range picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Report Period
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Report cards */}
      <div className="space-y-3">
        {REPORT_TYPES.map((report) => (
          <div
            key={report.id}
            className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/40 transition-colors"
          >
            <div>
              <p className="font-medium text-[var(--color-foreground)]">{report.label}</p>
              <p className="text-sm text-[var(--color-muted-foreground)]">{report.desc}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 ml-4 flex-shrink-0"
              onClick={() => download(report.id)}
              disabled={loading === report.id}
            >
              {loading === report.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              CSV
            </Button>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)] mt-4">
        PDF reports are available on the Pro plan. CSV exports are available on all plans.
      </p>
    </div>
  );
}
