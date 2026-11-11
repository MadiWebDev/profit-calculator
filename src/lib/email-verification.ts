/**
 * Email verification helpers — pure, framework-free functions so the
 * sign-in and resend contracts are unit-testable (route modules and the
 * Auth.js config can't be imported in vitest).
 *
 * Background: Auth.js v5 swallows a plain Error thrown in authorize() —
 * the callback wraps it in CallbackRouteError and the client only ever
 * sees `error=Configuration`, so the login page's old
 * `res.error.includes("EMAIL_NOT_VERIFIED")` check never fired and every
 * unverified sign-in showed "Invalid email or password". The documented
 * mechanism for a distinct sign-in failure is a CredentialsSignin
 * subclass with a custom `code`: Auth.js appends it to the redirect URL
 * (`?error=CredentialsSignin&code=...`) and next-auth/react returns it as
 * `res.code` (typed on SignInResponse). The code is only set AFTER
 * password validation in authorize(), so it can never be used to probe
 * whether an address is registered-but-unverified.
 */

/** Auth.js `code` carried on a credentials sign-in failure for unverified email. */
export const EMAIL_NOT_VERIFIED_CODE = "email_not_verified";

/**
 * Extract the Auth.js `code` query param from a sign-in response URL
 * (absolute or relative). Returns null when absent or unparseable.
 */
export function parseAuthErrorCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://localhost").searchParams.get("code");
  } catch {
    return null;
  }
}

/**
 * True when a failed credentials sign-in means "registered, correct
 * password, email not verified". next-auth/react v5 returns `code`
 * first-class; the URL fallback covers callers that only carry it.
 */
export function isEmailNotVerifiedSignIn(res: {
  error?: string | null;
  code?: string | null;
  url?: string | null;
}): boolean {
  const code = res.code ?? parseAuthErrorCode(res.url);
  return res.error === "CredentialsSignin" && code === EMAIL_NOT_VERIFIED_CODE;
}

/**
 * Should a fresh verification token be issued for this user? Only
 * credential users that are still unverified get one — Google OAuth users
 * are verified at creation, and everyone else gets the generic success
 * so the endpoint can't be used to enumerate accounts.
 */
export function shouldIssueVerificationToken(user: {
  password?: string | null;
  emailVerified?: Date | null;
} | null | undefined): boolean {
  return !!user && !!user.password && !user.emailVerified;
}

export type ResendOutcomeKind = "sent" | "queued" | "rateLimited" | "failed";

export interface ResendOutcome {
  kind: ResendOutcomeKind;
  /** Exact message the UI may show for this outcome. */
  message: string;
}

/**
 * Map a resend attempt to what the UI may honestly claim.
 * - sent: a token was issued and the provider accepted the email.
 * - queued: no token was issued (unknown email, already verified, OAuth
 *   account) — the generic success is deliberate (no enumeration), so the
 *   message must stay neutral and true.
 * - rateLimited / failed: the request did not go through; say so instead
 *   of claiming an email was sent.
 */
export function interpretResendOutcome(input: {
  ok: boolean;
  status: number;
  delivered?: boolean;
  code?: string;
}): ResendOutcome {
  if (!input.ok) {
    if (input.status === 429) {
      return { kind: "rateLimited", message: "Too many requests — please try again in a bit." };
    }
    return { kind: "failed", message: "Could not send the verification email. Please try again." };
  }
  if (input.code === "SEND_FAILED") {
    return { kind: "failed", message: "Could not send the verification email. Please try again." };
  }
  if (input.delivered === true) {
    return { kind: "sent", message: "Verification email sent — check your inbox." };
  }
  return {
    kind: "queued",
    message: "If an unverified account exists for this email, a new verification link is on its way.",
  };
}

/**
 * POST /api/auth/verify-email/resend and interpret the result — the single
 * honest path shared by the login panel and the verify page. Never claims
 * success when the server did not confirm a send; never throws.
 */
export async function requestVerificationResend(email: string): Promise<ResendOutcome> {
  try {
    const res = await fetch("/api/auth/verify-email/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    let body: { delivered?: boolean; code?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON body — treated as a failed send below */
    }
    return interpretResendOutcome({
      ok: res.ok,
      status: res.status,
      delivered: body.delivered,
      code: body.code,
    });
  } catch {
    return { kind: "failed", message: "Could not send the verification email. Please try again." };
  }
}
