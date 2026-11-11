import { describe, it, expect, vi, afterEach } from "vitest";
import {
  EMAIL_NOT_VERIFIED_CODE,
  parseAuthErrorCode,
  isEmailNotVerifiedSignIn,
  shouldIssueVerificationToken,
  interpretResendOutcome,
  requestVerificationResend,
} from "@/lib/email-verification";

describe("parseAuthErrorCode", () => {
  it("reads the code from an absolute sign-in redirect URL", () => {
    expect(
      parseAuthErrorCode("http://localhost:3000/auth/login?error=CredentialsSignin&code=email_not_verified")
    ).toBe("email_not_verified");
    expect(
      parseAuthErrorCode("http://localhost:3000/auth/login?error=CredentialsSignin&code=credentials")
    ).toBe("credentials");
  });

  it("reads the code from a relative URL", () => {
    expect(parseAuthErrorCode("/auth/login?error=CredentialsSignin&code=email_not_verified")).toBe(
      "email_not_verified"
    );
  });

  it("returns null when there is no code, no URL, or a malformed URL", () => {
    expect(parseAuthErrorCode("http://localhost:3000/auth/login?error=CredentialsSignin")).toBeNull();
    expect(parseAuthErrorCode(null)).toBeNull();
    expect(parseAuthErrorCode(undefined)).toBeNull();
    expect(parseAuthErrorCode("")).toBeNull();
    expect(parseAuthErrorCode("http://[invalid")).toBeNull();
  });
});

describe("isEmailNotVerifiedSignIn", () => {
  it("is true only for CredentialsSignin with the unverified code", () => {
    expect(
      isEmailNotVerifiedSignIn({ error: "CredentialsSignin", code: EMAIL_NOT_VERIFIED_CODE })
    ).toBe(true);
  });

  it("is false for a wrong password (generic code)", () => {
    expect(isEmailNotVerifiedSignIn({ error: "CredentialsSignin", code: "credentials" })).toBe(false);
  });

  it("is false for other error types and missing fields", () => {
    expect(isEmailNotVerifiedSignIn({ error: "Configuration", code: EMAIL_NOT_VERIFIED_CODE })).toBe(false);
    expect(isEmailNotVerifiedSignIn({ error: undefined, code: EMAIL_NOT_VERIFIED_CODE })).toBe(false);
    expect(isEmailNotVerifiedSignIn({})).toBe(false);
  });

  it("falls back to parsing the redirect URL when code is absent", () => {
    expect(
      isEmailNotVerifiedSignIn({
        error: "CredentialsSignin",
        url: "http://localhost:3000/auth/login?error=CredentialsSignin&code=email_not_verified",
      })
    ).toBe(true);
    expect(
      isEmailNotVerifiedSignIn({
        error: "CredentialsSignin",
        url: "http://localhost:3000/auth/login?error=CredentialsSignin&code=credentials",
      })
    ).toBe(false);
  });
});

describe("shouldIssueVerificationToken", () => {
  it("issues only for credential users that are still unverified", () => {
    expect(shouldIssueVerificationToken({ password: "hashed", emailVerified: null })).toBe(true);
    expect(shouldIssueVerificationToken({ password: "hashed", emailVerified: undefined })).toBe(true);
  });

  it("never issues for verified, OAuth, or missing users", () => {
    expect(
      shouldIssueVerificationToken({ password: "hashed", emailVerified: new Date() })
    ).toBe(false);
    expect(shouldIssueVerificationToken({ password: undefined, emailVerified: null })).toBe(false);
    expect(shouldIssueVerificationToken({ password: null, emailVerified: null })).toBe(false);
    expect(shouldIssueVerificationToken(null)).toBe(false);
    expect(shouldIssueVerificationToken(undefined)).toBe(false);
  });
});

describe("interpretResendOutcome", () => {
  it("claims sent only when the server confirmed delivery", () => {
    const r = interpretResendOutcome({ ok: true, status: 200, delivered: true });
    expect(r.kind).toBe("sent");
    expect(r.message).toMatch(/check your inbox/i);
  });

  it("stays neutral when no token was issued (enumeration-safe)", () => {
    const r = interpretResendOutcome({ ok: true, status: 200, delivered: false });
    expect(r.kind).toBe("queued");
    expect(r.message).toMatch(/if an unverified account exists/i);
    // The message must not claim an email was sent.
    expect(r.message).not.toMatch(/email sent/i);
  });

  it("reports a rate limit honestly", () => {
    const r = interpretResendOutcome({ ok: false, status: 429 });
    expect(r.kind).toBe("rateLimited");
    expect(r.message).toMatch(/too many requests/i);
  });

  it("reports a failed send honestly instead of a false success", () => {
    expect(interpretResendOutcome({ ok: false, status: 502, code: "SEND_FAILED" }).kind).toBe("failed");
    expect(interpretResendOutcome({ ok: true, status: 200, code: "SEND_FAILED" }).kind).toBe("failed");
    expect(interpretResendOutcome({ ok: false, status: 500 }).kind).toBe("failed");
  });
});

describe("requestVerificationResend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: { ok: boolean; status: number; body?: unknown; throws?: boolean }) {
    const fetchMock = vi.fn(async () => {
      if (response.throws) throw new Error("network down");
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.body ?? {},
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts the email and returns sent when delivery is confirmed", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, body: { success: true, delivered: true } });
    const outcome = await requestVerificationResend("unverified@test.local");
    expect(outcome.kind).toBe("sent");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-email/resend",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "unverified@test.local" }),
      })
    );
  });

  it("returns queued when the server issued no token", async () => {
    stubFetch({ ok: true, status: 200, body: { success: true, delivered: false } });
    expect((await requestVerificationResend("nobody@test.local")).kind).toBe("queued");
  });

  it("returns rateLimited on 429 and failed on a send failure", async () => {
    stubFetch({ ok: false, status: 429, body: { error: "Too many requests", code: "RATE_LIMITED" } });
    expect((await requestVerificationResend("a@test.local")).kind).toBe("rateLimited");

    stubFetch({ ok: false, status: 502, body: { error: "Could not send", code: "SEND_FAILED" } });
    expect((await requestVerificationResend("a@test.local")).kind).toBe("failed");
  });

  it("returns failed (never throws) when the network fails", async () => {
    stubFetch({ ok: false, status: 0, throws: true });
    const outcome = await requestVerificationResend("a@test.local");
    expect(outcome.kind).toBe("failed");
  });
});
