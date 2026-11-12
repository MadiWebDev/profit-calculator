"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SUPPORT_RESPONSE_TIME, SUPPORT_TOPIC_LABELS, type SupportTopic } from "@/lib/support";

type Status = "idle" | "sending" | "sent" | "error";

const inputClass =
  "flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";

export function SupportForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const sending = status === "sending";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      topic: String(form.get("topic") ?? "other") as SupportTopic,
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
    };
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (json as { error?: string }).error ??
            "Something went wrong sending your message. Please try again.",
        );
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error — please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8 text-center"
      >
        <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Message received</h2>
        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed max-w-md mx-auto">
          Thanks — your message is recorded and we aim to reply within {SUPPORT_RESPONSE_TIME} at the
          email you gave. If it&apos;s urgent, email us directly at hello@getprofitcalc.com.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label="Contact support form" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label htmlFor="support-name" className="text-sm font-medium text-[var(--color-foreground)]">
            Name
          </label>
          <input id="support-name" name="name" type="text" required minLength={2} maxLength={100} autoComplete="name" className={inputClass} placeholder="Your name" disabled={sending} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-email" className="text-sm font-medium text-[var(--color-foreground)]">
            Email
          </label>
          <input id="support-email" name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} placeholder="you@example.com" disabled={sending} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-topic" className="text-sm font-medium text-[var(--color-foreground)]">
          Topic
        </label>
        <select id="support-topic" name="topic" required className={inputClass} defaultValue="other" disabled={sending}>
          {(Object.entries(SUPPORT_TOPIC_LABELS) as [SupportTopic, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-message" className="text-sm font-medium text-[var(--color-foreground)]">
          Message
        </label>
        <textarea
          id="support-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          disabled={sending}
          className="flex w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] resize-none"
          placeholder="Describe your question, the page you were on, and what you expected to see…"
        />
      </div>

      {/* Honeypot — hidden from humans, traps bots. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="support-website">Leave this field empty</label>
        <input id="support-website" name="website" type="text" autoComplete="off" tabIndex={-1} />
      </div>

      {status === "error" && error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button
        type="submit"
        loading={sending}
        loadingText="Sending…"
        className="px-6"
      >
        Send Message
      </Button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Your message is stored so our team can follow up, and emailed to our support inbox. We never share
        it with anyone else.
      </p>
    </form>
  );
}
