"use client";

/**
 * DirectMessageDialog — one message to one user, no campaign. Opened
 * from the user directory's Message button: pick Email or WhatsApp,
 * write, send. The dialog owns its form state and resets whenever a
 * different user is opened.
 *
 * Email: subject (optional) + body (required, {{name}} works, same
 * renderer as campaigns — HTML-escaped with the unsubscribe footer).
 * WhatsApp: Meta-approved template name only. There is no free-text
 * body for WhatsApp — the template's own approved text is what Meta
 * sends, with {{1}} as the recipient's first name — so the dialog
 * shows the template field instead of a body field, and says so.
 *
 * A refusal (suppressed, unsubscribed, no phone, bad template,
 * missing credentials) is shown in the dialog with the server's exact
 * message — nothing is sent and no record is created. A provider
 * rejection is recorded as failed and shown the same way.
 */
import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inputCls, type Channel, type DirectoryUser } from "./types";

export function DirectMessageDialog({
  user,
  onClose,
  onSent,
}: {
  user: DirectoryUser | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setChannel("email");
    setSubject("");
    setBody("");
    setTemplateName("");
    setSending(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const canSend =
    !sending &&
    !!user &&
    (channel === "email"
      ? body.trim().length > 0
      : templateName.trim().length > 0 && user.hasPhone);

  const send = async () => {
    if (!user || !canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          channel,
          ...(channel === "email"
            ? { subject: subject.trim(), body: body.trim() }
            : { whatsappTemplateName: templateName.trim() }),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Failed to send the message.");
        return;
      }
      if (j.status === "failed") {
        setError(j.error ?? "The provider rejected the message.");
        onSent();
        return;
      }
      toast.success(`Direct message sent to ${user.name || user.email}.`);
      onSent();
      close();
    } catch {
      setError("Failed to send the message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Message {user?.name || user?.email || "user"}
          </DialogTitle>
          <DialogDescription>
            One message to one user — no campaign is created. Sent messages
            appear in the Messages tab.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              To: {user.name || "—"} · {user.email}
              {user.hasPhone ? "" : " · no phone on file"}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <div className="flex gap-2" role="group" aria-label="Channel">
                <Button
                  type="button"
                  variant={channel === "email" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChannel("email")}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
                <Button
                  type="button"
                  variant={channel === "whatsapp" ? "default" : "outline"}
                  size="sm"
                  disabled={!user.hasPhone}
                  title={user.hasPhone ? undefined : "No phone number on file for this user"}
                  onClick={() => setChannel("whatsapp")}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </Button>
              </div>
              {!user.hasPhone && (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  WhatsApp is unavailable — this user has no phone number on file.
                </p>
              )}
            </div>
            {channel === "email" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dm-subject" className="text-xs">
                    Subject (optional)
                  </Label>
                  <Input
                    id="dm-subject"
                    value={subject}
                    maxLength={200}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dm-body" className="text-xs">
                    Message
                  </Label>
                  <textarea
                    id="dm-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    placeholder="Write the message… Use {{name}} for the recipient's first name."
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Use {"{{name}}"} for the recipient&apos;s first name. {body.length}/5000
                    characters.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="dm-template" className="text-xs">
                  WhatsApp template name
                </Label>
                <Input
                  id="dm-template"
                  value={templateName}
                  maxLength={512}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. hello_world"
                  className={cn(templateName.trim() && !/^[a-z0-9_]+$/.test(templateName.trim()) && "border-red-500")}
                />
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  The exact Meta-approved template name from Business Manager
                  (lowercase letters, digits and underscores). The
                  template&apos;s own text is sent — {`{{1}}`} is the
                  recipient&apos;s first name. A template that Meta has not
                  approved will be rejected.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!canSend}>
            {sending ? "Sending…" : "Send message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
