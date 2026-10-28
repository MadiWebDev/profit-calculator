"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Team-enforced 2FA enrolment. Reached from the dashboard layout redirect
 * when a session carries twoFactorSetupRequired (the member's team
 * requires 2FA for owners/admins and the member has none yet).
 *
 * Flow: setup → enter a code from the new secret → enable → recovery
 * codes shown ONCE → session flags cleared → dashboard. No QR code
 * library is bundled, so enrolment uses manual secret entry: every
 * authenticator app accepts pasting the secret shown here.
 */
export default function TwoFactorSetupPage() {
  const { status, update } = useSession();
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
        const j = await res.json();
        if (j.error === "Two-factor is already enabled") {
          await update({ user: { twoFactorPending: false, twoFactorSetupRequired: false } });
          router.push("/dashboard");
          return;
        }
        if (!res.ok) throw new Error(j.error ?? "Setup failed");
        setSecret(j.secret);
        setOtpauthUrl(j.otpauthUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Setup failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router, update]);

  const submit = async () => {
    setError(null);
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Invalid code");
      return;
    }
    setRecoveryCodes(j.recoveryCodes ?? []);
  };

  const finish = async () => {
    await update({ user: { twoFactorPending: false, twoFactorSetupRequired: false } });
    router.push("/dashboard");
  };

  if (status === "loading" || loading) return <p>Preparing two-factor setup…</p>;
  if (error && !secret) return <div><h1>Two-factor setup</h1><p>{error}</p></div>;

  if (recoveryCodes) {
    return (
      <div>
        <h1>Two-factor enabled</h1>
        <p>Save these recovery codes somewhere safe — each works once if you lose your authenticator device:</p>
        <ul>{recoveryCodes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <button onClick={finish}>Continue to dashboard</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Set up two-factor authentication</h1>
      <p>Your team requires two-factor authentication for admins. Add this account to your authenticator app with the secret below, then enter a code to confirm.</p>
      {secret && (
        <>
          <p>Secret: <code>{secret}</code></p>
          {otpauthUrl && <p>Or add manually with this URL: <code>{otpauthUrl}</code></p>}
        </>
      )}
      <label>Code <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" /></label>
      {error && <p>{error}</p>}
      <button onClick={submit}>Enable two-factor</button>
      <p>Any signed-in member can also open this page directly to enable two-factor authentication voluntarily.</p>
    </div>
  );
}
