"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const startSetup = async () => {
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    if (res.ok) setSetup(await res.json());
  };
  const enable = async () => {
    const res = await fetch("/api/auth/2fa/enable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) setSetup(await res.json());
    else alert("Invalid code — check your authenticator app and try again.");
  };
  const revoke = async (deviceId: string) => {
    await fetch("/api/auth/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }) });
    setDevices((d) => d.map((x) => (x.id === deviceId ? { ...x, revokedAt: new Date().toISOString() } : x)));
  };
  const revokeAll = async () => {
    if (!confirm("Revoke all sessions? You will be signed out everywhere.")) return;
    await fetch("/api/auth/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revokeAll: true }) });
    setDevices((d) => d.map((x) => ({ ...x, revokedAt: new Date().toISOString() })));
  };

  if (loading) return <p>Loading security overview…</p>;
  if (error) return <p>{error} <button onClick={() => location.reload()}>Retry</button></p>;

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
            <label>Code from your app <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></label>
            <button onClick={enable}>Enable 2FA</button>
          </div>
        ) : (
          <button onClick={startSetup}>Set up two-factor authentication</button>
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
                {d.revokedAt ? " — revoked" : <button onClick={() => revoke(d.id)}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
        <button onClick={revokeAll}>Revoke all sessions</button>
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
