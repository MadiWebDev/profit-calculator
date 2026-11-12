"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useCurrency } from "@/components/dashboard/CurrencyContext";

export default function CopilotPage() {
  const { formatMoney, baseCurrency } = useCurrency();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<Record<string, number | string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askAction = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/analytics/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (!res.ok) throw new Error("ask failed");
      const j = await res.json();
      setAnswer(j.answer); setNumbers(j.numbers);
    } catch { setError("Could not answer that question. Check your connection and try again."); }
  });

  const ask = (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setAnswer(null);
    void askAction.run();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">AI Copilot</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Ask about your numbers. Every answer is computed from aggregated totals only and shows the numbers behind it — no customer names, emails, or order-level data are used or returned.</p>
      </div>
      <Card><CardContent className="py-6">
        <form onSubmit={ask}>
          <fieldset disabled={askAction.loading} className="space-y-3 border-0 m-0 min-w-0 p-0">
          <div className="space-y-1"><Label htmlFor="copilot-q">Your question</Label><Input id="copilot-q" required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Which country is most profitable? Which campaigns are losing money?" /></div>
          <Button type="submit" loading={askAction.loading} loadingText="Thinking…">Ask</Button>
          <p className="text-xs text-[var(--color-muted-foreground)]">Try: “Where should I stop advertising?”, “What is leaking profit?”, “How much did we make?”</p>
          </fieldset>
        </form>
      </CardContent></Card>
      {error && <Card><CardContent role="alert" className="py-6 text-sm text-red-600">{error}</CardContent></Card>}
      {answer && (
        <Card><CardHeader><CardTitle>Answer</CardTitle></CardHeader><CardContent className="space-y-3">
          <p className="text-sm">{answer}</p>
          {numbers && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span>Revenue: {formatMoney(Number(numbers.revenue), baseCurrency)}</span>
              <span>Net profit: {formatMoney(Number(numbers.netProfit), baseCurrency)}</span>
              <span>Margin: {numbers.netMargin}%</span>
              <span>Orders: {numbers.orders}</span>
              <span>AOV: {formatMoney(Number(numbers.aov), baseCurrency)}</span>
              <span>Ad spend: {formatMoney(Number(numbers.adSpend), baseCurrency)}</span>
            </div>
          )}
          <p className="text-xs text-[var(--color-muted-foreground)]">Numbers behind this answer, from the last 30 days of orders. Verify them on Revenue By Date, Country Analysis, or the Leak Detector.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
