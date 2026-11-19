/**
 * Per-recipient report (moved unchanged from CampaignsClient.tsx,
 * Phase 3). Used by the campaign detail drawer and the sent-messages
 * log, so both show the same table and the same honest tracking note.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RECIPIENT_STATUS_STYLES,
  type Channel,
  type RecipientRow,
  type RecipientStatus,
} from "./types";

export function RecipientTable({
  recipients,
  statusFilter,
}: {
  recipients: RecipientRow[];
  statusFilter: "all" | RecipientStatus;
}) {
  const visible =
    statusFilter === "all" ? recipients : recipients.filter((r) => r.status === statusFilter);
  if (recipients.length === 0) {
    return <p className="text-xs text-[var(--color-muted-foreground)]">No recipients recorded yet.</p>;
  }
  if (visible.length === 0) {
    return (
      <p className="text-xs text-[var(--color-muted-foreground)]">
        No recipients with status “{statusFilter}” for this campaign.
      </p>
    );
  }
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--color-muted-foreground)]">
            <th className="py-1 pr-2 font-medium">Recipient</th>
            <th className="py-1 pr-2 font-medium">Status</th>
            <th className="py-1 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={`${r.identifier}-${i}`} className="border-t border-[var(--color-border)]">
              <td className="py-1.5 pr-2 break-all">{r.identifier}</td>
              <td className="py-1.5 pr-2">
                <Badge className={cn("text-xs capitalize", RECIPIENT_STATUS_STYLES[r.status])}>
                  {r.status}
                </Badge>
              </td>
              <td className="py-1.5 text-[var(--color-muted-foreground)] break-words">{r.error ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const WEBHOOK_DERIVED_STATUSES: RecipientStatus[] = [
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "read",
  "suppressed",
];

/**
 * Honest tracking note (Phase 2). "Sent" means only that the provider
 * API accepted the message; delivery/open/click/read arrive from the
 * Resend / Meta webhooks. When no recipient has a webhook-derived
 * status yet, the UI says so plainly instead of showing a zero as if
 * it were measured. Messages sent before the webhooks were registered
 * never gain delivery data.
 */
export function TrackingNote({
  recipients,
  channel,
}: {
  recipients: RecipientRow[];
  channel: Channel;
}) {
  const hasTracking = recipients.some((r) =>
    WEBHOOK_DERIVED_STATUSES.includes(r.status)
  );
  if (!hasTracking) {
    return (
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Tracking unavailable — no delivery events received yet for this
        campaign. Delivery, open, click and read data arrive from the
        Resend / Meta webhooks once they are configured; messages sent
        before the webhooks were registered have no delivery data.
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
      “Sent” means the provider accepted the message.{" "}
      {channel === "email"
        ? "Opens are estimated — Apple Mail Privacy Protection pre-loads images, so an open does not prove a human read it."
        : "Read only appears when the recipient has WhatsApp read receipts on — no read status proves nothing."}
    </p>
  );
}
