"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListSkeleton, StatsSkeleton } from "@/components/ui/skeleton";

interface EventRow { type: string; count: number }
interface RecentRow { type: string; at: string; ipTruncated?: string; metadata?: Record<string, unknown> }
interface DeviceRow { id: string; userAgent?: string; ipTruncated?: string; lastSeenAt: string; revokedAt?: string; trustedUntil?: string }

export function SecurityClient({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [byType, setByType] = useState<EventRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<{ otpauthUrl?: string; secret?: string; recoveryCodes?: string[] } | null>(null);
  const [code, setCode] = useState("");
  // Which 2FA/session action is in flight — the page's plain buttons show
  // a busy label and disable while it runs (no shared Button here: this
  // page is unstyled plain HTML and a styled Button would restyle it).
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sec, dev] = await Promise.all([fetch("/api/admin/security"), fetch("/api/auth/sessions")]);
      if (sec.ok) {
        const j = await sec.json();
        setByType(j.byType ?? []);
        setRecent(j.recent ?? []);
      }
      if (dev.ok) {
        const j = await dev.json();
        setDevices(j.devices ?? []);
      }
    } catch {
      setError("Could not load security data.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data load on mount; no SSR alternative for an authenticated fetch */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const startSetup = async () => {
    setBusy("setup");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      if (res.ok) setSetup(await res.json());
    } finally {
      setBusy(null);
    }
  };
  const enable = async () => {
    setBusy("enable");
    try {
      const res = await fetch("/api/auth/2fa/enable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.ok) setSetup(await res.json());
      else alert("Invalid code — check your authenticator app and try again.");
    } finally {
      setBusy(null);
    }
  };
  const revoke = async (deviceId: string) => {
    setBusy(`revoke:${deviceId}`);
    try {
      await fetch("/api/auth/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }) });
      setDevices((d) => d.map((x) => (x.id === deviceId ? { ...x, revokedAt: new Date().toISOString() } : x)));
    } finally {
      setBusy(null);
    }
  };
  const revokeAll = async () => {
    if (!confirm("Revoke all sessions? You will be signed out everywhere.")) return;
    setBusy("revoke-all");
    try {
      await fetch("/api/auth/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revokeAll: true }) });
      setDevices((d) => d.map((x) => ({ ...x, revokedAt: new Date().toISOString() })));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div>
        <h1>Security</h1>
        <StatsSkeleton count={3} />
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <h1>Security</h1>
        <p role="alert">{error}</p>
        <Button variant="outline" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <h1>Security</h1>
      <section>
        <h2>Two-factor authentication</h2>
        {twoFactorEnabled ? (
          <p>Two-factor authentication is enabled for your account. Keep your recovery codes somewhere safe — each can be used once.</p>
        ) : setup?.recoveryCodes ? (
          <div>
            <p><strong>Enabled.</strong> Save these recovery codes now — they are shown once and each works once:</p>
            <ul>{setup.recoveryCodes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          </div>
        ) : setup?.otpauthUrl ? (
          <div>
            <p>Scan this QR data in your authenticator app, or enter the secret manually:</p>
            <p><code>{setup.secret}</code></p>
            <p><a href={setup.otpauthUrl}>Open in authenticator app</a></p>
            <label>Code from your app <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" disabled={busy !== null} /></label>
            <button onClick={enable} disabled={busy !== null}>{busy === "enable" ? "Enabling…" : "Enable 2FA"}</button>
          </div>
        ) : (
          <button onClick={startSetup} disabled={busy !== null}>{busy === "setup" ? "Setting up…" : "Set up two-factor authentication"}</button>
        )}
        <p>Passkeys (WebAuthn) are planned, not yet available — see docs/THREAT_MODEL.md.</p>
      </section>

      <section>
        <h2>Sessions &amp; devices</h2>
        {devices.length === 0 ? (
          <p>No recorded sessions yet. Sign in from a device to see it here.</p>
        ) : (
          <ul>
            {devices.map((d) => (
              <li key={d.id}>
                {d.userAgent ?? "Unknown device"} — last seen {new Date(d.lastSeenAt).toLocaleString()}
                {d.ipTruncated ? ` — IP ${d.ipTruncated}` : ""}
                {d.trustedUntil ? " — trusted device" : ""}
                {d.revokedAt ? " — revoked" : (
                  <button onClick={() => revoke(d.id)} disabled={busy !== null}>
                    {busy === `revoke:${d.id}` ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button onClick={revokeAll} disabled={busy !== null}>{busy === "revoke-all" ? "Revoking…" : "Revoke all sessions"}</button>
      </section>

      <section>
        <h2>Security events (last 30 days)</h2>
        {byType.length === 0 ? <p>No security events recorded in the last 30 days.</p> : (
          <ul>{byType.map((e) => <li key={e.type}>{e.type}: {e.count}</li>)}</ul>
        )}
        <h3>Recent</h3>
        <ul>{recent.slice(0, 20).map((e, i) => <li key={i}>{e.type} — {new Date(e.at).toLocaleString()}{e.ipTruncated ? ` — ${e.ipTruncated}` : ""}</li>)}</ul>
      </section>
    </div>
  );
}
