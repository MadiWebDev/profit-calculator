"use client";

import { useState } from "react";
import {
  requestVerificationResend,
  type ResendOutcome,
} from "@/lib/email-verification";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/use-async-action";

/**
 * Inline "send me a new verification link" form, shared by the
 * verify-email page's expired and invalid-token states. Reuses the same
 * honest resend contract as the login panel: the result only claims
 * "sent" when the server confirmed the email was accepted.
 */
export default function VerifyResendForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResendOutcome | null>(null);

  const sendAction = useAsyncAction(async (value: string) => {
    setResult(await requestVerificationResend(value.toLowerCase()));
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError("Email is required");
      return;
    }
    setError("");
    void sendAction.run(value);
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
          disabled={sendAction.loading}
          className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <Button
        type="submit"
        loading={sendAction.loading}
        loadingText="Sending…"
        className="w-full"
      >
        Send a new verification link
      </Button>

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
