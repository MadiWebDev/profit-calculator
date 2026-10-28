import { describe, it, expect } from "vitest";
import { generateTotpSecret, totpCode, verifyTotp, generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode } from "@/lib/totp";

describe("TOTP (RFC 6238)", () => {
  it("generates and verifies a code at a fixed time", () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    const code = totpCode(secret, at);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, at)).toBe(true);
  });
  it("rejects a wrong code and a code from another secret", () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    expect(verifyTotp(secret, "000000", at)).toBe(false);
    // Find a code from another secret that differs from this secret's code
    // (a 1-in-a-million collision would make the assertion meaningless).
    let other = totpCode(generateTotpSecret(), at);
    while (other === totpCode(secret, at)) other = totpCode(generateTotpSecret(), at);
    expect(verifyTotp(secret, other, at)).toBe(false);
  });
  it("accepts a code one step away (clock skew) but not two", () => {
    const secret = generateTotpSecret();
    const at = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, at + 30_000), at)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, at + 90_000), at)).toBe(false);
  });
  it("recovery codes verify once via hashes and are consumed by index", () => {
    const codes = generateRecoveryCodes(3);
    const hashes = codes.map(hashRecoveryCode);
    const idx = verifyRecoveryCode(codes[1], hashes);
    expect(idx).toBe(1);
    expect(verifyRecoveryCode("WRONG-CODE", hashes)).toBe(-1);
    // Hashes never contain the raw code
    expect(hashes.join(" ")).not.toContain(codes[0]);
  });
});
