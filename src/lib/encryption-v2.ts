/**
 * Versioned, authenticated encryption — AES-256-GCM (R3).
 *
 * Replaces the unauthenticated CryptoJS AES-CBC in encryption.ts for all
 * NEW writes. Legacy ciphertext (CryptoJS format, no "v2:" prefix) still
 * decrypts, so existing tokens keep working until the rotation script
 * re-encrypts them.
 *
 * Keyring: ENCRYPTION_KEYS_JSON = {"v1":"<64 hex>","v2":"<64 hex>"}.
 * Fallback: ENCRYPTION_KEY (legacy env) is treated as key "v1".
 * The CURRENT key id is ENCRYPTION_CURRENT_KEY_ID (default: highest
 * version in the keyring, or "v1"). Keys must be 32 bytes (64 hex chars).
 * Format: v2:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface Keyring {
  current: string;
  keys: Record<string, Buffer>;
}

function hexKey(s: string): Buffer | null {
  if (!/^[0-9a-fA-F]{64}$/.test(s.trim())) return null;
  return Buffer.from(s.trim(), "hex");
}

export function loadKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
  const keys: Record<string, Buffer> = {};
  try {
    const parsed = env.ENCRYPTION_KEYS_JSON ? JSON.parse(env.ENCRYPTION_KEYS_JSON) : {};
    for (const [id, val] of Object.entries(parsed)) {
      const k = typeof val === "string" ? hexKey(val) : null;
      if (k) keys[id] = k;
    }
  } catch {
    // fall through to legacy key
  }
  if (Object.keys(keys).length === 0 && env.ENCRYPTION_KEY) {
    const k = hexKey(env.ENCRYPTION_KEY);
    if (k) keys.v1 = k;
  }
  const ids = Object.keys(keys).sort();
  const current = env.ENCRYPTION_CURRENT_KEY_ID && keys[env.ENCRYPTION_CURRENT_KEY_ID]
    ? env.ENCRYPTION_CURRENT_KEY_ID
    : ids[ids.length - 1];
  return { current, keys };
}

export function encryptV2(plaintext: string, keyring: Keyring = loadKeyring()): string {
  const key = keyring.keys[keyring.current];
  if (!key) throw new Error("ENCRYPTION_KEYS: no current key configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${keyring.current}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt v2 ciphertext; returns null on tamper / unknown key / bad format. */
export function decryptV2(ciphertext: string, keyring: Keyring = loadKeyring()): string | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "v2") return null;
    const [, keyId, ivB64, tagB64, ctB64] = parts;
    const key = keyring.keys[keyId];
    if (!key) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered ciphertext must never throw into a caller
  }
}

/**
 * Decrypt anything this app may have stored: v2 first, then legacy
 * CryptoJS format (for migration only — never write legacy format again).
 */
export function decryptAny(ciphertext: string | null | undefined, keyring: Keyring = loadKeyring()): string | null {
  if (!ciphertext) return null;
  if (ciphertext.startsWith("v2:")) return decryptV2(ciphertext, keyring);
  try {
    // Lazy import: keep the legacy path out of the hot path and out of
    // edge bundles that import this module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CryptoJS = require("crypto-js");
    const key = process.env.ENCRYPTION_KEY;
    if (!key) return null;
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const out = bytes.toString(CryptoJS.enc.Utf8);
    return out || null;
  } catch {
    return null;
  }
}

export function isV2Ciphertext(s: string | null | undefined): boolean {
  return !!s && s.startsWith("v2:");
}
