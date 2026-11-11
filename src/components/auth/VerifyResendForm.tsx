"use client";

import { useState } from "react";
import {
  requestVerificationResend,
  type ResendOutcome,
} from "@/lib/email-verification";

/**
 * Inline "send me a new verification link" form, shared by the
 * verify-email page's expired and invalid-token states. Reuses the same
 * honest resend contract as the login panel: the result only claims
 * "sent" when the server confirmed the email was accepted.
 */
export default function VerifyResendForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResendOutcome | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError("Email is required");
      return;
    }
    setError("");
    setSending(true);
    try {
      setResult(await requestVerificationResend(value.toLowerCase()));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-3 text-left">
      <div className="space-y-1.5">
        <label htmlFor="vr-email" className="text-sm font-medium leading-none">
          Email
        </label>
        <input
          id="vr-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-full h-10 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send a new verification link"}
      </button>

      {result && (
        <p
          role="status"
          className={
            result.kind === "sent"
              ? "text-sm text-green-600 dark:text-green-400"
              : result.kind === "queued"
                ? "text-sm text-[var(--color-muted-foreground)]"
                : "text-sm text-red-500"
          }
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
