/**
 * Campaign tracking — pure unit tests (Phase 2).
 *
 * Covers the provider event maps, the payload parsers, and the
 * transition-gated status derivation. No DB: the ingest flow (dedup,
 * atomic apply, suppression side effects) is covered by
 * campaign-webhook-db.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  RESEND_EVENT_MAP,
  WHATSAPP_STATUS_MAP,
  deriveRecipientUpdate,
  parseResendWebhook,
  parseWhatsappWebhook,
  timestampFieldForEvent,
} from "@/lib/campaign-tracking";

describe("RESEND_EVENT_MAP", () => {
  it("maps every delivery event the audit requires", () => {
    expect(RESEND_EVENT_MAP["email.sent"]).toBe("sent");
    expect(RESEND_EVENT_MAP["email.delivered"]).toBe("delivered");
    expect(RESEND_EVENT_MAP["email.bounced"]).toBe("bounced");
    expect(RESEND_EVENT_MAP["email.complained"]).toBe("complained");
    expect(RESEND_EVENT_MAP["email.opened"]).toBe("opened");
    expect(RESEND_EVENT_MAP["email.clicked"]).toBe("clicked");
    expect(RESEND_EVENT_MAP["email.failed"]).toBe("failed");
    expect(RESEND_EVENT_MAP["email.suppressed"]).toBe("suppressed");
  });

  it("maps delivery_delayed to nothing (acknowledged, no status change)", () => {
    expect(RESEND_EVENT_MAP["email.delivery_delayed"]).toBeNull();
  });

  it("maps unknown types to nothing", () => {
    expect(RESEND_EVENT_MAP["email.whatever"]).toBeUndefined();
  });
});

describe("WHATSAPP_STATUS_MAP", () => {
  it("maps sent/delivered/read/failed", () => {
    expect(WHATSAPP_STATUS_MAP.sent).toBe("sent");
    expect(WHATSAPP_STATUS_MAP.delivered).toBe("delivered");
    expect(WHATSAPP_STATUS_MAP.read).toBe("read");
    expect(WHATSAPP_STATUS_MAP.failed).toBe("failed");
  });
});

describe("timestampFieldForEvent", () => {
  it("sets failedAt for both failed and bounced", () => {
    expect(timestampFieldForEvent("failed")).toBe("failedAt");
    expect(timestampFieldForEvent("bounced")).toBe("failedAt");
  });

  it("sets no timestamp for sent/complained/suppressed", () => {
    expect(timestampFieldForEvent("sent")).toBeNull();
    expect(timestampFieldForEvent("complained")).toBeNull();
    expect(timestampFieldForEvent("suppressed")).toBeNull();
  });
});

describe("deriveRecipientUpdate", () => {
  const at = new Date("2026-11-19T12:00:00.000Z");

  it("moves sent → delivered and stamps deliveredAt", () => {
    const update = deriveRecipientUpdate("sent", "delivered", at);
    expect(update).toEqual({
      status: "delivered",
      timestampField: "deliveredAt",
      occurredAt: at,
    });
  });

  it("moves delivered → read and stamps readAt", () => {
    const update = deriveRecipientUpdate("delivered", "read", at);
    expect(update?.status).toBe("read");
    expect(update?.timestampField).toBe("readAt");
  });

  it("rejects a same-status event (second delivered changes nothing)", () => {
    expect(deriveRecipientUpdate("delivered", "delivered", at)).toBeNull();
  });

  it("rejects anything after a terminal state (read cannot follow bounced)", () => {
    expect(deriveRecipientUpdate("bounced", "delivered", at)).toBeNull();
    expect(deriveRecipientUpdate("bounced", "read", at)).toBeNull();
    expect(deriveRecipientUpdate("failed", "delivered", at)).toBeNull();
    expect(deriveRecipientUpdate("complained", "clicked", at)).toBeNull();
  });

  it("allows delivered → bounced (a late bounce is a failure)", () => {
    const update = deriveRecipientUpdate("delivered", "bounced", at);
    expect(update?.status).toBe("bounced");
    expect(update?.timestampField).toBe("failedAt");
  });
});

describe("parseResendWebhook", () => {
  it("parses a delivered event with email_id and first recipient", () => {
    const parsed = parseResendWebhook(
      {
        type: "email.delivered",
        created_at: "2026-11-19T12:00:00.000Z",
        data: {
          email_id: "re_abc123",
          to: ["aisha@example.com"],
          subject: "Hi",
        },
      },
      "msg_1"
    );
    expect(parsed).toMatchObject({
      eventType: "delivered",
      providerMessageId: "re_abc123",
      identifier: "aisha@example.com",
      providerEventId: "resend:msg_1",
      rawType: "email.delivered",
    });
    expect(parsed?.occurredAt.toISOString()).toBe("2026-11-19T12:00:00.000Z");
  });

  it("accepts `to` as a plain string and unknown types as ignored", () => {
    const parsed = parseResendWebhook(
      {
        type: "email.mystery",
        data: { email_id: "re_x", to: "bilal@example.com" },
      },
      "msg_2"
    );
    expect(parsed?.eventType).toBeNull();
    expect(parsed?.identifier).toBe("bilal@example.com");
  });

  it("returns null without an email_id", () => {
    expect(
      parseResendWebhook(
        { type: "email.delivered", data: { to: ["a@example.com"] } },
        "msg_3"
      )
    ).toBeNull();
    expect(parseResendWebhook(null, "msg_3")).toBeNull();
    expect(parseResendWebhook("nope", "msg_3")).toBeNull();
  });
});

describe("parseWhatsappWebhook", () => {
  it("parses every status across entries and changes", () => {
    const events = parseWhatsappWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                statuses: [
                  {
                    id: "wamid.AAA",
                    status: "delivered",
                    timestamp: "1793030400",
                    recipient_id: "923001234567",
                  },
                  {
                    id: "wamid.BBB",
                    status: "read",
                    timestamp: "1793030500",
                    recipient_id: "923007654321",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventType: "delivered",
      providerMessageId: "wamid.AAA",
      identifier: "923001234567",
      providerEventId: "whatsapp:wamid.AAA:delivered:1793030400",
    });
    expect(events[0].occurredAt.getTime()).toBe(1793030400 * 1000);
    expect(events[1].eventType).toBe("read");
  });

  it("ignores inbound messages and payloads with no statuses", () => {
    const events = parseWhatsappWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: { messages: [{ id: "wamid.in", type: "text" }] },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(0);
    expect(parseWhatsappWebhook({})).toHaveLength(0);
    expect(parseWhatsappWebhook(null)).toHaveLength(0);
  });
});
