"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertCircle, CheckCircle2, ArrowLeft,
  MailCheck, MailX, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { cn } from "@/lib/utils";
import { SUPPORT_TOPIC_LABELS } from "@/lib/support";
import { MESSAGE_STATUSES, MESSAGE_STATUS_LABELS } from "@/lib/admin-messages";

interface MessageRow {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  userAgent: string | null;
  status: "new" | "replied" | "closed";
  emailSent: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  new:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  replied: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function MessageDetailClient({ messageId }: { messageId: string }) {
  const [message,  setMessage]  = useState<MessageRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [reply,    setReply]    = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setMessage(j.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load message.");
    } finally {
      setLoading(false);
    }
  }, [messageId]);

  // Mount-time data fetch — the effect is the correct place (suppressed: set-state-in-effect)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const setStatusAction = useAsyncAction(async (status: string) => {
    setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, status }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Update failed"); return; }
      setMessage(j.message);
      setSuccess(`Status set to ${MESSAGE_STATUS_LABELS[status as keyof typeof MESSAGE_STATUS_LABELS]}.`);
    } catch {
      setError("Could not reach the server. Try again.");
    }
  });

  const setStatus = (status: string) => {
    void setStatusAction.run(status);
  };

  const sendReplyAction = useAsyncAction(async () => {
    if (!reply.trim()) { setError("Write a reply first."); return; }
    setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Reply failed to send"); return; }
      setMessage(j.message);
      setReply("");
      setSuccess(`Reply sent to ${j.message.email}. Status set to Replied.`);
    } catch {
      setError("Could not reach the server. Try again.");
    }
  });

  const sendReply = () => {
    void sendReplyAction.run();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" className="text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (!message) {
    return (
      <div className="space-y-6">
        <Link href="/admin/messages" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="h-4 w-4" /> Back to Messages
        </Link>
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error ?? "Message not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/messages" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
        <ArrowLeft className="h-4 w-4" /> Back to Messages
      </Link>

      {/* Feedback */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
          <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Message */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{message.name}</CardTitle>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                <a href={`mailto:${message.email}`} className="hover:underline">{message.email}</a>
                {" · "}
                {new Date(message.createdAt).toLocaleString()}
              </p>
            </div>
            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", STATUS_COLORS[message.status])}>
              {MESSAGE_STATUS_LABELS[message.status]}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Topic</p>
              <p className="font-medium mt-0.5">{SUPPORT_TOPIC_LABELS[message.topic as keyof typeof SUPPORT_TOPIC_LABELS] ?? message.topic}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Inbox email (hello@)</p>
              <p className="font-medium mt-0.5 inline-flex items-center gap-1">
                {message.emailSent ? (
                  <><MailCheck className="h-3.5 w-3.5 text-green-600" /> Sent</>
                ) : (
                  <><MailX className="h-3.5 w-3.5" /> Not sent</>
                )}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-[var(--color-muted-foreground)]">Browser</p>
              <p className="font-medium mt-0.5 break-all text-xs">{message.userAgent ?? "—"}</p>
            </div>
          </div>
          <div className="rounded-lg bg-[var(--color-muted)]/50 border border-[var(--color-border)] px-4 py-3">
            <p className="text-sm whitespace-pre-wrap text-[var(--color-foreground)]">{message.message}</p>
          </div>

          {/* Status actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-[var(--color-muted-foreground)] mr-1">Set status:</span>
            {MESSAGE_STATUSES.filter((s) => s !== message.status).map((s) => (
              <Button key={s} variant="outline" size="sm" loading={setStatusAction.loading} loadingText="Updating…" disabled={sendReplyAction.loading} onClick={() => setStatus(s)} className="h-8 text-xs capitalize">
                {s === "new" ? "Reopen" : `Mark ${MESSAGE_STATUS_LABELS[s].toLowerCase()}`}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reply */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reply by email</CardTitle>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Sent from GetProfitCalc to {message.email} — replies from the customer come back to hello@getprofitcalc.com.
            On success this message is marked Replied.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Write your reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={6}
            className="resize-y"
            disabled={sendReplyAction.loading}
          />
          <div className="flex items-center gap-3">
            <Button onClick={sendReply} loading={sendReplyAction.loading} loadingText="Sending reply…" disabled={!reply.trim() || setStatusAction.loading} className="gap-1.5">
              <Send className="h-4 w-4" />
              Send reply
            </Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">{reply.trim().length} / 5000 characters</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
