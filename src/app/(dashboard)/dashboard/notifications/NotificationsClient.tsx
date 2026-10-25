"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Rule {
  event: string;
  channel: "whatsapp" | "email" | "both";
  enabled: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  order_confirmed: "Order confirmed",
  order_shipped: "Order shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  refund_issued: "Refund issued",
  cod_tracking: "COD tracking ID (send tracking ID for COD orders)",
};

export function NotificationsClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/notify-rules");
      if (!r.ok) throw new Error("load");
      setRules((await r.json()).rules ?? []);
    } catch {
      setError("Could not load notification rules. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data load on mount; no SSR alternative for an authenticated fetch */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async (rule: Rule) => {
    setSaving(rule.event);
    setNotice(null);
    try {
      const r = await fetch("/api/notify-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!r.ok) throw new Error("save");
      setRules((prev) => prev.map((p) => (p.event === rule.event ? rule : p)));
      setNotice(`Saved: ${EVENT_LABELS[rule.event] ?? rule.event}.`);
    } catch {
      setError("Could not save that rule. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  const update = (event: string, patch: Partial<Rule>) =>
    setRules((prev) => prev.map((r) => (r.event === event ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Order Notifications</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Send an automatic WhatsApp message and/or email after each order update. Nothing is sent
          for an event until you enable it here, and a message is never sent twice for the same
          order and event. WhatsApp needs WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID; without
          them, WhatsApp is skipped and email still sends when configured.
        </p>
      </div>

      {error && <Card><CardContent className="py-6 text-center text-sm text-red-600">{error}</CardContent></Card>}
      {notice && <Card><CardContent className="py-3 text-sm">{notice}</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle className="text-base">Rules per order event</CardTitle></CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-[var(--color-muted-foreground)]" role="status">Loading…</p>}
          <ul className="space-y-4">
            {rules.map((r) => (
              <li key={r.event} className="rounded-xl border border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{EVENT_LABELS[r.event] ?? r.event}</span>
                  {r.enabled
                    ? <Badge variant="outline">Enabled · {r.channel}</Badge>
                    : <Badge variant="outline">Disabled</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-xs text-[var(--color-muted-foreground)]">
                      <input
                        type="checkbox"
                        className="mr-1"
                        checked={r.enabled}
                        onChange={(e) => update(r.event, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <select
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-sm"
                      value={r.channel}
                      onChange={(e) => update(r.event, { channel: e.target.value as Rule["channel"] })}
                      aria-label={`Channel for ${r.event}`}
                    >
                      <option value="whatsapp">WhatsApp only</option>
                      <option value="email">Email only</option>
                      <option value="both">WhatsApp + email</option>
                    </select>
                    <Button size="sm" disabled={saving === r.event} onClick={() => save(r)}>
                      Save
                    </Button>
                  </div>
                </div>
                {r.event === "cod_tracking" && (
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    When enabled, a COD order&apos;s shipment message is the COD tracking message (tracking ID +
                    courier + cash-on-delivery wording) instead of the generic shipped message.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
