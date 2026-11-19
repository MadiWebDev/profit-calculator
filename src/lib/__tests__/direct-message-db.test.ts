/**
 * DB-backed direct-message tests — the send guarantees:
 *  - a successful email / WhatsApp send stores a "sent" record with the
 *    provider message id (and the email HTML substitutes {{name}})
 *  - a suppressed or unsubscribed user is refused with 409 and NO
 *    record is created (no override, no silent send)
 *  - a missing / invalid phone is refused with 400 and no record
 *  - a missing provider key is a 503 with no record
 *  - a provider rejection creates a FAILED record with the exact error
 *
 * DB-backed: run this file on its own (see setup-db.ts); the suite
 * shares ./.mongo-mem with the other DB files. No real message is ever
 * sent — the email impl and the Meta fetch are fakes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import UserModel from "@/models/User";
import DirectMessageModel from "@/models/DirectMessage";
import MessageSuppressionModel from "@/models/MessageSuppression";
import {
  sendDirectMessage,
  DirectMessageError,
} from "@/lib/direct-messages";
import { suppress } from "@/lib/suppression";

const ADMIN_ID = new mongoose.Types.ObjectId().toString();

const OLD_ENV = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
};

beforeAll(async () => {
  await setupTestDb();
  await DirectMessageModel.syncIndexes();
  await MessageSuppressionModel.syncIndexes();
  await UserModel.syncIndexes();
  // Test-only dummy credentials: the fakes below never call a provider,
  // but the preflight checks that the keys exist.
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.WHATSAPP_ACCESS_TOKEN = "wa_test_dummy";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
});

afterAll(async () => {
  process.env.RESEND_API_KEY = OLD_ENV.RESEND_API_KEY;
  process.env.WHATSAPP_ACCESS_TOKEN = OLD_ENV.WHATSAPP_ACCESS_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = OLD_ENV.WHATSAPP_PHONE_NUMBER_ID;
  await teardownTestDb();
});

beforeEach(async () => {
  await clearDb();
});

async function seedUser(over: Record<string, unknown> = {}) {
  return UserModel.create({
    name: "Aisha Khan",
    email: "aisha@example.com",
    passwordHash: "x".repeat(60),
    phone: "+923001234567",
    ...over,
  });
}

function fakeEmailSend() {
  const calls: { to: string; subject: string; html: string }[] = [];
  const impl = async (payload: { from: string; to: string; subject: string; html: string }) => {
    calls.push({ to: payload.to, subject: payload.subject, html: payload.html });
    return { id: "re_test_1" };
  };
  return { impl, calls };
}

function fakeWhatsappFetch(ok: boolean, body: string) {
  // Minimal fetch stand-in: only ok + text() are read by the sender.
  const calls: { url: string; init: unknown }[] = [];
  const impl = (async (url: string, init: unknown) => {
    calls.push({ url, init });
    return { ok, status: ok ? 200 : 400, text: async () => body };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { impl, calls };
}

describe("sendDirectMessage — email", () => {
  it("sends and stores a sent record with the Resend id", async () => {
    const user = await seedUser();
    const { impl, calls } = fakeEmailSend();
    const doc = await sendDirectMessage(
      {
        userId: user._id.toString(),
        channel: "email",
        subject: "Hello",
        body: "Hi {{name}}, welcome!",
      },
      { createdBy: ADMIN_ID, emailSendImpl: impl }
    );
    expect(doc.status).toBe("sent");
    expect(doc.providerMessageId).toBe("re_test_1");
    expect(doc.sentAt).toBeTruthy();
    expect(doc.identifier).toBe("aisha@example.com");
    expect(doc.subject).toBe("Hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("aisha@example.com");
    // {{name}} is substituted with the first name, HTML-escaped.
    expect(calls[0].html).toContain("Hi Aisha");
    expect(calls[0].html).toContain("welcome!");
    expect(await DirectMessageModel.countDocuments({})).toBe(1);
  });

  it("refuses a suppressed email address with 409 and no record", async () => {
    const user = await seedUser();
    await suppress({
      identifier: "aisha@example.com",
      channel: "email",
      reason: "bounced",
      source: "webhook",
    });
    const { impl } = fakeEmailSend();
    await expect(
      sendDirectMessage(
        { userId: user._id.toString(), channel: "email", body: "Hi" },
        { createdBy: ADMIN_ID, emailSendImpl: impl }
      )
    ).rejects.toMatchObject({ status: 409, code: "DIRECT_MESSAGE_SUPPRESSED" });
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });

  it("refuses a user who unsubscribed, with 409 and no record", async () => {
    const user = await seedUser({ emailUnsubscribedAt: new Date() });
    const { impl } = fakeEmailSend();
    await expect(
      sendDirectMessage(
        { userId: user._id.toString(), channel: "email", body: "Hi" },
        { createdBy: ADMIN_ID, emailSendImpl: impl }
      )
    ).rejects.toMatchObject({ status: 409, code: "DIRECT_MESSAGE_UNSUBSCRIBED" });
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });

  it("records a failed send when the provider rejects it", async () => {
    const user = await seedUser();
    const failing = async () => {
      throw new Error("Resend boom");
    };
    const doc = await sendDirectMessage(
      { userId: user._id.toString(), channel: "email", body: "Hi" },
      { createdBy: ADMIN_ID, emailSendImpl: failing }
    );
    expect(doc.status).toBe("failed");
    expect(doc.error).toBe("Resend boom");
    expect(doc.sentAt).toBeUndefined();
    expect(doc.providerMessageId).toBeUndefined();
  });

  it("answers 503 with no record when RESEND_API_KEY is missing", async () => {
    const user = await seedUser();
    const { impl } = fakeEmailSend();
    delete process.env.RESEND_API_KEY;
    try {
      await expect(
        sendDirectMessage(
          { userId: user._id.toString(), channel: "email", body: "Hi" },
          { createdBy: ADMIN_ID, emailSendImpl: impl }
        )
      ).rejects.toMatchObject({ status: 503, code: "EMAIL_NOT_CONFIGURED" });
    } finally {
      process.env.RESEND_API_KEY = "re_test_dummy";
    }
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });

  it("throws 404 for an unknown user", async () => {
    const { impl } = fakeEmailSend();
    await expect(
      sendDirectMessage(
        { userId: new mongoose.Types.ObjectId().toString(), channel: "email", body: "Hi" },
        { createdBy: ADMIN_ID, emailSendImpl: impl }
      )
    ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });
  });
});

describe("sendDirectMessage — WhatsApp", () => {
  it("sends a template and stores a sent record with the wamid", async () => {
    const user = await seedUser();
    const { impl, calls } = fakeWhatsappFetch(
      true,
      JSON.stringify({ messages: [{ id: "wamid_test_1" }] })
    );
    const doc = await sendDirectMessage(
      {
        userId: user._id.toString(),
        channel: "whatsapp",
        whatsappTemplateName: "hello_world",
      },
      { createdBy: ADMIN_ID, whatsappFetchImpl: impl }
    );
    expect(doc.status).toBe("sent");
    expect(doc.providerMessageId).toBe("wamid_test_1");
    expect(doc.whatsappTemplateName).toBe("hello_world");
    expect(doc.body).toBe("");
    expect(doc.identifier).toBe("+923001234567");
    expect(calls).toHaveLength(1);
    expect(await DirectMessageModel.countDocuments({})).toBe(1);
  });

  it("refuses with 400 when the user has no phone", async () => {
    const user = await seedUser({ phone: undefined });
    // The seed helper defaults phone; unset it explicitly.
    await UserModel.updateOne({ _id: user._id }, { $unset: { phone: "" } });
    const { impl } = fakeWhatsappFetch(true, "{}");
    await expect(
      sendDirectMessage(
        {
          userId: user._id.toString(),
          channel: "whatsapp",
          whatsappTemplateName: "hello_world",
        },
        { createdBy: ADMIN_ID, whatsappFetchImpl: impl }
      )
    ).rejects.toMatchObject({ status: 400, code: "NO_PHONE" });
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });

  it("refuses with 400 when the phone is not valid E.164", async () => {
    const user = await seedUser({ phone: "03001234567" });
    const { impl } = fakeWhatsappFetch(true, "{}");
    await expect(
      sendDirectMessage(
        {
          userId: user._id.toString(),
          channel: "whatsapp",
          whatsappTemplateName: "hello_world",
        },
        { createdBy: ADMIN_ID, whatsappFetchImpl: impl }
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_PHONE" });
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });

  it("records a failed send with Meta's exact error", async () => {
    const user = await seedUser();
    const { impl } = fakeWhatsappFetch(
      false,
      JSON.stringify({ error: { message: "Template not approved" } })
    );
    const doc = await sendDirectMessage(
      {
        userId: user._id.toString(),
        channel: "whatsapp",
        whatsappTemplateName: "hello_world",
      },
      { createdBy: ADMIN_ID, whatsappFetchImpl: impl }
    );
    expect(doc.status).toBe("failed");
    expect(doc.error).toContain("Template not approved");
  });

  it("refuses a suppressed phone number with 409 and no record", async () => {
    const user = await seedUser();
    await suppress({
      identifier: "+923001234567",
      channel: "whatsapp",
      reason: "complained",
      source: "webhook",
    });
    const { impl } = fakeWhatsappFetch(true, "{}");
    await expect(
      sendDirectMessage(
        {
          userId: user._id.toString(),
          channel: "whatsapp",
          whatsappTemplateName: "hello_world",
        },
        { createdBy: ADMIN_ID, whatsappFetchImpl: impl }
      )
    ).rejects.toMatchObject({ status: 409, code: "DIRECT_MESSAGE_SUPPRESSED" });
    expect(await DirectMessageModel.countDocuments({})).toBe(0);
  });
});

describe("DirectMessageError", () => {
  it("carries status and code", () => {
    const e = new DirectMessageError(409, "DIRECT_MESSAGE_SUPPRESSED", "nope");
    expect(e.status).toBe(409);
    expect(e.code).toBe("DIRECT_MESSAGE_SUPPRESSED");
    expect(e.message).toBe("nope");
  });
});
