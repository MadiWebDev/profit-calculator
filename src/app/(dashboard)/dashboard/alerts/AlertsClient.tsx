"use client";

import { useState } from "react";
import { ShieldAlert, Plus, Trash2, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AlertEvaluation, AlertMetric, AlertOperator } from "@/lib/alerts";

interface RuleRow {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  windowDays: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

const METRIC_LABELS: Record<AlertMetric, string> = {
  profit_margin: "Profit margin (%)",
  refund_rate: "Refund rate (%)",
  rto_rate: "RTO rate (%)",
  avg_order_profit: "Avg order profit",
};

export function AlertsClient({
  rules: initialRules,
  evaluations: initialEvals,
}: {
  rules: RuleRow[];
  evaluations: AlertEvaluation[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [evals, setEvals] = useState(initialEvals);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<AlertMetric>("profit_margin");
  const [operator, setOperator] = useState<AlertOperator>("below");
  const [threshold, setThreshold] = useState("20");
  const [windowDays, setWindowDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/alerts");
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules);
      setEvals(data.evaluations);
    }
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          metric,
          operator,
          threshold: Number(threshold),
          windowDays: Number(windowDays),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not create rule");
      }
      setName("");
      setThreshold("20");
      setWindowDays("30");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create rule");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(id: string, enabled: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await refresh();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this guardrail rule?")) return;
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    await refresh();
  }

  const evalByRule = new Map(evals.map((ev) => [ev.ruleId, ev]));
  const triggered = evals.filter((ev) => ev.triggered);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" /> Guardrails
        </h1>
        <p className="text-muted-foreground">
          Rules that watch your numbers and raise a notification when a
          threshold breaches. Evaluated daily by cron, at most one
          notification per rule per day.
        </p>
      </div>

      {triggered.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <BellRing className="h-5 w-5" /> {triggered.length} breached right now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {triggered.map((ev) => (
              <p key={ev.ruleId} className="text-sm">
                {ev.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New rule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRule} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Margin floor"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-metric">Metric</Label>
              <select
                id="rule-metric"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={metric}
                onChange={(e) => setMetric(e.target.value as AlertMetric)}
              >
                {(Object.keys(METRIC_LABELS) as AlertMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-operator">Condition</Label>
              <select
                id="rule-operator"
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={operator}
                onChange={(e) => setOperator(e.target.value as AlertOperator)}
              >
                <option value="below">Below</option>
                <option value="above">Above</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-threshold">Threshold</Label>
              <Input
                id="rule-threshold"
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rule-window">Window (days)</Label>
              <Input
                id="rule-window"
                type="number"
                min={1}
                max={365}
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>
                Create rule
              </Button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rules yet. Try: profit margin below 20% over 30 days.
            </p>
          )}
          {rules.map((rule) => {
            const ev = evalByRule.get(rule.id);
            return (
              <div key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {METRIC_LABELS[rule.metric]} {rule.operator} {rule.threshold} · last{" "}
                    {rule.windowDays} days
                  </p>
                  {ev && (
                    <p className="text-sm">
                      Current: {ev.value}
                      {rule.metric !== "avg_order_profit" ? "%" : ""} ·{" "}
                      {ev.triggered ? (
                        <span className="font-medium text-destructive">{ev.message}</span>
                      ) : (
                        <span className="text-muted-foreground">within threshold</span>
                      )}
                    </p>
                  )}
                  {!rule.enabled && <Badge variant="secondary">Paused</Badge>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleRule(rule.id, !rule.enabled)}
                >
                  {rule.enabled ? "Pause" : "Resume"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
