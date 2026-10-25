"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * 2FA login step (S1.1). Reached after a password login when the user
 * has 2FA enabled: the session carries twoFactorPending=true until this
 * page verifies a code (or a trusted-device cookie) and calls
 * session.update() to clear the flag. API routes reject pending sessions.
 */
export default function TwoFactorVerifyPage() {
  const { update } = useSession();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa/trusted-check", { method: "POST" });
        const j = await res.json();
        if (j.trusted) {
          await update({ user: { twoFactorPending: false } });
          router.push("/dashboard");
          return;
        }
      } catch { /* fall through to code entry */ }
      setChecking(false);
    })();
  }, [update, router]);

  const submit = async () => {
    setError(null);
    const res = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, rememberDevice }),
    });
    if (!res.ok) {
      setError("Invalid code. Try again, or use a recovery code.");
      return;
    }
    await update({ user: { twoFactorPending: false } });
    router.push("/dashboard");
  };

  if (checking) return <p>Checking trusted device…</p>;
  return (
    <div>
      <h1>Two-factor verification</h1>
      <p>Enter the 6-digit code from your authenticator app, or a recovery code.</p>
      <label>Code <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" /></label>
      <label><input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} /> Remember this device for 30 days</label>
      {error && <p>{error}</p>}
      <button onClick={submit}>Verify</button>
    </div>
  );
}
