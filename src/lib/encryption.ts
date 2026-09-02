import CryptoJS from "crypto-js";

const KEY = process.env.ENCRYPTION_KEY!;

if (!KEY && typeof window === "undefined") {
  // Only warn server-side; don't throw at import time (breaks build)
  console.warn("⚠️  ENCRYPTION_KEY is not set. Token encryption will fail at runtime.");
}

/**
 * Encrypt a plaintext string with AES-256.
 * Use before writing OAuth tokens / API keys to MongoDB.
 */
export function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, KEY).toString();
}

/**
 * Decrypt an AES-256 ciphertext string.
 * Use after reading encrypted tokens from MongoDB.
 */
export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Safely decrypt — returns null instead of throwing on bad ciphertext.
 */
export function safeDecrypt(ciphertext: string | undefined | null): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}
