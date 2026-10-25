import { describe, it, expect } from "vitest";
import { encryptV2, decryptV2, decryptAny, loadKeyring, isV2Ciphertext } from "@/lib/encryption-v2";
import { sanitizeMongo, containsMongoOperator } from "@/lib/sanitize-mongo";
import { neutralizeCsvCell, toCsv } from "@/lib/csv-injection";

const KEYRING = loadKeyring({
  ...process.env,
  ENCRYPTION_KEYS_JSON: JSON.stringify({ v1: "a".repeat(64), v2: "b".repeat(64) }),
  ENCRYPTION_CURRENT_KEY_ID: "v2",
} as NodeJS.ProcessEnv);

describe("AES-256-GCM versioned encryption (R3)", () => {
  it("round-trips and tags the key version", () => {
    const ct = encryptV2("shopify-token-123", KEYRING);
    expect(isV2Ciphertext(ct)).toBe(true);
    expect(ct.startsWith("v2:v2:")).toBe(true);
    expect(decryptV2(ct, KEYRING)).toBe("shopify-token-123");
  });
  it("tampered ciphertext fails closed (null, never throws)", () => {
    const ct = encryptV2("secret", KEYRING);
    const tampered = ct.slice(0, -4) + "AAAA";
    expect(decryptV2(tampered, KEYRING)).toBeNull();
    expect(decryptV2("v2:v9:bad:bad:bad", KEYRING)).toBeNull();
  });
  it("decryptAny handles v2; legacy format without a key returns null", () => {
    expect(decryptAny(encryptV2("x", KEYRING), KEYRING)).toBe("x");
    expect(decryptAny(null, KEYRING)).toBeNull();
  });
});

describe("Mongo sanitizer (R5)", () => {
  it("strips $ operators and dotted keys, preserves safe fields", () => {
    const dirty = { name: "a", password: { $ne: "" }, "a.b": 1, nested: { $gt: 5, ok: 1 } };
    const clean = sanitizeMongo(dirty);
    expect(clean).toEqual({ name: "a", password: {}, nested: { ok: 1 } });
    expect(containsMongoOperator(dirty)).toBe(true);
    expect(containsMongoOperator(clean)).toBe(false);
  });
  it("does not mutate the input", () => {
    const dirty = { q: { $ne: 1 } };
    sanitizeMongo(dirty);
    expect(dirty.q).toEqual({ $ne: 1 });
  });
});

describe("CSV injection (R7)", () => {
  it("neutralizes formula cells, including whitespace-smuggled ones", () => {
    expect(neutralizeCsvCell("=2+2")).toBe("'=2+2");
    expect(neutralizeCsvCell("  @SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(neutralizeCsvCell("-2+3")).toBe("'-2+3");
    expect(neutralizeCsvCell("hello")).toBe("hello");
    expect(neutralizeCsvCell(42)).toBe("42");
  });
  it("toCsv neutralizes every cell in a row", () => {
    const csv = toCsv(["name", "note"], [["x", "=cmd"]]);
    expect(csv).toContain("'=cmd");
    expect(csv).not.toContain(",=cmd");
  });
});
