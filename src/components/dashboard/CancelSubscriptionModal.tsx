"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CancelSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  plan: string;
  periodEnd?: string;
}

export function CancelSubscriptionModal({ open, onClose, onConfirm, plan, periodEnd }: CancelSubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) return null;

  const endDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "the end of your billing period";

  const handleConfirm = async () => {
    if (typed !== "cancel") return;
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl p-6">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-4">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-1">Cancel your {plan} plan?</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            This will cancel your subscription at the end of the current period.
          </p>
        </div>

        {/* What you lose */}
        <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 mb-5 text-sm text-red-700 dark:text-red-300 space-y-1.5">
          <p className="font-semibold mb-2">You will lose access to:</p>
          <p>✗ Real-time profit tracking and order sync</p>
          <p>✗ AI profit insights</p>
          <p>✗ Ad spend integration</p>
          <p>✗ All dashboard features</p>
        </div>

        {/* Grace period info */}
        <div className="rounded-xl bg-[var(--color-accent)] border border-[var(--color-border)] p-4 mb-5 text-sm">
          <p className="font-semibold text-[var(--color-foreground)] mb-1">Your data is safe</p>
          <p className="text-[var(--color-muted-foreground)]">
            You keep full access until <strong className="text-[var(--color-foreground)]">{endDate}</strong>. Your data is retained for 30 days after cancellation, so you can reactivate without losing anything.
          </p>
        </div>

        {/* Confirmation input */}
        <div className="mb-5 space-y-1.5">
          <label className="text-sm text-[var(--color-muted-foreground)]">
            Type <strong className="text-[var(--color-foreground)] font-mono">cancel</strong> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="cancel"
            className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Keep Subscription</Button>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            disabled={typed !== "cancel" || loading}
            onClick={handleConfirm}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cancel Plan
          </Button>
        </div>
      </div>
    </div>
  );
}
