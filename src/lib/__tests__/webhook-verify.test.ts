/**
 * Webhook signature verification — pure unit tests (Phase 2).
 *
 * The Svix vector below was computed independently with Python's hmac
 * (not with the implementation under test), so it proves the HMAC
 * formula, not just that the code agrees with itself:
 *   secret (base64): d2hzZWNfdGVzdF9zZWNyZXRfZm9yX3BoYXNlMg==
 *   svix-id: msg_test123, svix-timestamp: 1614265330
 *   payload: {"type":"email.delivered","data":{"email_id":"re_test_123"}}
 *   signature: v1,bmLKdtt/9/t9yPZLTcfLQv++n0fQ5LGnzOuwU6+YcXY=
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifySvixSignature,
  verifyMetaSignature,
} from "@/lib/webhook-verify";

const SVIX_SECRET = "d2hzZWNfdGVzdF9zZWNyZXRfZm9yX3BoYXNlMg==";
const SVIX_ID = "msg_test123";
const SVIX_TIMESTAMP = "1614265330";
const SVIX_NOW = 1614265330;
const SVIX_PAYLOAD =
  '{"type":"email.delivered","data":{"email_id":"re_test_123"}}';
const SVIX_SIGNATURE =
  "v1,bmLKdtt/9/t9yPZLTcfLQv++n0fQ5LGnzOuwU6+YcXY=";

describe("verifySvixSignature", () => {
  it("accepts the independently computed vector", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW,
      })
    ).toBe(true);
  });

  it("accepts when a matching v1 signature is one of several (key rotation)", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${SVIX_SIGNATURE}`,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW,
      })
    ).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD.replace("delivered", "bounced"),
        nowSeconds: SVIX_NOW,
      })
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(
      verifySvixSignature({
        secret: Buffer.from("whsec_a_different_secret").toString("base64"),
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW,
      })
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: null,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW,
      })
    ).toBe(false);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW + 3600,
      })
    ).toBe(false);
  });

  it("rejects a timestamp far in the future", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: SVIX_SIGNATURE,
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW - 3600,
      })
    ).toBe(false);
  });

  it("rejects a non-v1 signature version", () => {
    expect(
      verifySvixSignature({
        secret: SVIX_SECRET,
        svixId: SVIX_ID,
        svixTimestamp: SVIX_TIMESTAMP,
        svixSignature: "v0,bmLKdtt/9/t9yPZLTcfLQv++n0fQ5LGnzOuwU6+YcXY=",
        rawBody: SVIX_PAYLOAD,
        nowSeconds: SVIX_NOW,
      })
    ).toBe(false);
  });
});

describe("verifyMetaSignature", () => {
  const appSecret = "meta_app_secret_for_tests";
  const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
  const goodSignature =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  it("accepts a correct X-Hub-Signature-256", () => {
    expect(
      verifyMetaSignature({
        appSecret,
        signatureHeader: goodSignature,
        rawBody,
      })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyMetaSignature({
        appSecret,
        signatureHeader: goodSignature,
        rawBody: rawBody + " ",
      })
    ).toBe(false);
  });

  it("rejects the wrong app secret", () => {
    expect(
      verifyMetaSignature({
        appSecret: "a_different_secret",
        signatureHeader: goodSignature,
        rawBody,
      })
    ).toBe(false);
  });

  it("rejects a missing header and a non-sha256 prefix", () => {
    expect(
      verifyMetaSignature({ appSecret, signatureHeader: null, rawBody })
    ).toBe(false);
    expect(
      verifyMetaSignature({
        appSecret,
        signatureHeader: "md5=deadbeef",
        rawBody,
      })
    ).toBe(false);
  });
});
