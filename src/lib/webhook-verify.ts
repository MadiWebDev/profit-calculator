/**
 * Provider webhook signature verification — pure helpers (Phase 2).
 *
 * Two providers, two schemes:
 * - Resend webhooks are delivered by Svix. Headers: `svix-id`,
 *   `svix-timestamp`, `svix-signature` (one or more space-separated
 *   `v1,<base64>` signatures; the secret is base64). The signed payload
 *   is `${svix-id}.${svix-timestamp}.${rawBody}` and the signature is
 *   base64(HMAC-SHA256(base64_decode(secret), signedPayload)).
 *   Implemented with node:crypto on purpose — no `svix` dependency for
 *   a 20-line HMAC.
 * - WhatsApp (Meta) webhooks carry `X-Hub-Signature-256: sha256=<hex>`
 *   — HMAC-SHA256 of the raw body with the Meta App Secret
 *   (META_APP_SECRET), compared with timingSafeEqual, mirroring the
 *   Meta deauthorize route.
 *
 * Both take the RAW body: never a re-serialized JSON object, or the
 * signature will not match.
 */
import crypto from "crypto";

/** Verify Resend/Svix webhook headers against the raw body. */
export function verifySvixSignature(input: {
  secret: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  rawBody: string;
  /**
   * Seconds since epoch, for the replay window. Defaults to now.
   * Injectable so tests can verify a fixed known-good vector (the
   * vector's timestamp is from 2021 and would otherwise be "stale").
   */
  nowSeconds?: number;
}): boolean {
  const { secret, svixId, svixTimestamp, svixSignature, rawBody } = input;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  // Svix timestamps are seconds since epoch; reject anything older
  // than 5 minutes or more than 5 minutes in the future — a replayed
  // delivery from hours ago is not a live webhook.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 300) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", key)
    .update(signedPayload, "utf8")
    .digest("base64");

  // One header can carry several space-separated signatures (key
  // rotation); any `v1,<sig>` match verifies.
  for (const part of svixSignature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const received = Buffer.from(sig, "base64");
    const expectedBuf = Buffer.from(expected, "base64");
    if (
      received.length === expectedBuf.length &&
      crypto.timingSafeEqual(received, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

/** Verify Meta's X-Hub-Signature-256 header against the raw body. */
export function verifyMetaSignature(input: {
  appSecret: string;
  signatureHeader: string | null;
  rawBody: string;
}): boolean {
  const { appSecret, signatureHeader, rawBody } = input;
  if (!appSecret || !signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-fA-F]+$/.test(receivedHex)) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = Buffer.from(receivedHex, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (received.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(received, expectedBuf);
}
