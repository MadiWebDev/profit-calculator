/**
 * Direct-message unit tests (no DB): the request schema and the
 * last-message merge helper. Send orchestration is DB-backed — see
 * direct-message-db.test.ts.
 */
import { describe, it, expect } from "vitest";
import { DirectMessageBodySchema } from "@/lib/direct-messages";
import {
  buildLastMessageMap,
  applyDirectMessagesToLastMessageMap,
  type LastMessageRow,
} from "@/lib/campaigns";

const USER_ID = "690c0d2a9b1e4f3a5c6d7e8f";

function validEmail() {
  return { userId: USER_ID, channel: "email" as const, subject: "Hi", body: "Hello {{name}}" };
}

function validWhatsapp() {
  return { userId: USER_ID, channel: "whatsapp" as const, whatsappTemplateName: "hello_world" };
}

describe("DirectMessageBodySchema", () => {
  it("accepts a valid email message", () => {
    expect(DirectMessageBodySchema.safeParse(validEmail()).success).toBe(true);
  });

  it("accepts a valid WhatsApp message", () => {
    expect(DirectMessageBodySchema.safeParse(validWhatsapp()).success).toBe(true);
  });

  it("rejects an email without a body", () => {
    const r = DirectMessageBodySchema.safeParse({ ...validEmail(), body: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects WhatsApp without a template name", () => {
    const r = DirectMessageBodySchema.safeParse({ userId: USER_ID, channel: "whatsapp" });
    expect(r.success).toBe(false);
  });

  it("rejects a WhatsApp template name with invalid characters", () => {
    const r = DirectMessageBodySchema.safeParse({
      ...validWhatsapp(),
      whatsappTemplateName: "Hello World!",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed user id", () => {
    const r = DirectMessageBodySchema.safeParse({ ...validEmail(), userId: "not-an-id" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const r = DirectMessageBodySchema.safeParse({ ...validEmail(), surprise: true });
    expect(r.success).toBe(false);
  });
});

describe("applyDirectMessagesToLastMessageMap", () => {
  const campaignRow = (userId: string, sentAt: string): LastMessageRow => ({
    userId,
    campaignId: "690c0d2a9b1e4f3a5c6d7e90",
    campaignName: "Launch",
    channel: "email",
    status: "sent",
    sentAt,
  });

  it("a newer direct message wins over the campaign row", () => {
    const map = buildLastMessageMap([campaignRow("u1", "2026-11-01T00:00:00.000Z")]);
    applyDirectMessagesToLastMessageMap(map, [
      {
        userId: "u1",
        directId: "690c0d2a9b1e4f3a5c6d7e91",
        channel: "whatsapp",
        status: "sent",
        sentAt: "2026-11-19T00:00:00.000Z",
        createdAt: "2026-11-19T00:00:00.000Z",
      },
    ]);
    expect(map.u1.campaignName).toBe("Direct message");
    expect(map.u1.channel).toBe("whatsapp");
  });

  it("an older direct message does not replace a newer campaign row", () => {
    const map = buildLastMessageMap([campaignRow("u1", "2026-11-19T00:00:00.000Z")]);
    applyDirectMessagesToLastMessageMap(map, [
      {
        userId: "u1",
        directId: "690c0d2a9b1e4f3a5c6d7e91",
        channel: "email",
        status: "sent",
        sentAt: "2026-11-01T00:00:00.000Z",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ]);
    expect(map.u1.campaignName).toBe("Launch");
  });

  it("a user with only a direct message gets a row", () => {
    const map = buildLastMessageMap([]);
    applyDirectMessagesToLastMessageMap(map, [
      {
        userId: "u2",
        directId: "690c0d2a9b1e4f3a5c6d7e91",
        channel: "email",
        status: "failed",
        sentAt: null,
        createdAt: "2026-11-19T00:00:00.000Z",
      },
    ]);
    expect(map.u2.campaignName).toBe("Direct message");
    expect(map.u2.status).toBe("failed");
    expect(map.u2.sentAt).toBe("2026-11-19T00:00:00.000Z");
  });

  it("drops rows with no user id", () => {
    const map = buildLastMessageMap([]);
    applyDirectMessagesToLastMessageMap(map, [
      {
        userId: "",
        directId: "690c0d2a9b1e4f3a5c6d7e91",
        channel: "email",
        status: "sent",
        sentAt: "2026-11-19T00:00:00.000Z",
        createdAt: "2026-11-19T00:00:00.000Z",
      },
    ]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});
