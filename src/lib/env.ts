/**
 * Startup environment variable validation.
 * Call once at app boot (e.g. in instrumentation.ts or top of db.ts).
 *
 * Critical vars cause a hard error in production.
 * Recommended vars log a warning — app still starts, but features may degrade.
 */

interface EnvVar {
  key: string;
  critical: boolean;
  description: string;
}

const REQUIRED_VARS: EnvVar[] = [
  // ── Auth ─────────────────────────────────────────────────────────────────
  { key: "AUTH_SECRET",   critical: true,  description: "NextAuth session signing secret" },
  { key: "MONGODB_URI",   critical: true,  description: "MongoDB connection string" },

  // ── Paddle (only payment gateway) ────────────────────────────────────────
  { key: "PADDLE_API_KEY",        critical: true,  description: "Paddle API secret key (server-side)" },
  { key: "PADDLE_WEBHOOK_SECRET", critical: true,  description: "Paddle webhook HMAC secret for signature verification" },
  {
    key: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    critical: false,
    description: "Paddle.js client token — enables inline overlay checkout (optional, falls back to redirect)",
  },

  // Paddle price IDs — Starter
  { key: "NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID",    critical: false, description: "Paddle price ID: Starter Monthly" },
  { key: "NEXT_PUBLIC_PADDLE_STARTER_QUARTERLY_PRICE_ID",  critical: false, description: "Paddle price ID: Starter 3-Month" },
  { key: "NEXT_PUBLIC_PADDLE_STARTER_SEMIANNUAL_PRICE_ID", critical: false, description: "Paddle price ID: Starter 6-Month" },
  { key: "NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID",     critical: false, description: "Paddle price ID: Starter Annual" },

  // Paddle price IDs — Growth
  { key: "NEXT_PUBLIC_PADDLE_GROWTH_MONTHLY_PRICE_ID",     critical: false, description: "Paddle price ID: Growth Monthly" },
  { key: "NEXT_PUBLIC_PADDLE_GROWTH_QUARTERLY_PRICE_ID",   critical: false, description: "Paddle price ID: Growth 3-Month" },
  { key: "NEXT_PUBLIC_PADDLE_GROWTH_SEMIANNUAL_PRICE_ID",  critical: false, description: "Paddle price ID: Growth 6-Month" },
  { key: "NEXT_PUBLIC_PADDLE_GROWTH_ANNUAL_PRICE_ID",      critical: false, description: "Paddle price ID: Growth Annual" },

  // Paddle price IDs — Pro
  { key: "NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID",        critical: false, description: "Paddle price ID: Pro Monthly" },
  { key: "NEXT_PUBLIC_PADDLE_PRO_QUARTERLY_PRICE_ID",      critical: false, description: "Paddle price ID: Pro 3-Month" },
  { key: "NEXT_PUBLIC_PADDLE_PRO_SEMIANNUAL_PRICE_ID",     critical: false, description: "Paddle price ID: Pro 6-Month" },
  { key: "NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID",         critical: false, description: "Paddle price ID: Pro Annual" },

  // ── Encryption ────────────────────────────────────────────────────────────
  { key: "ENCRYPTION_KEY", critical: false, description: "AES-256 key for encrypting OAuth tokens at rest (32-char hex)" },

  // ── Email ─────────────────────────────────────────────────────────────────
  { key: "RESEND_API_KEY", critical: false, description: "Resend API key for transactional email" },

  // ── AI ────────────────────────────────────────────────────────────────────
  { key: "OPENAI_API_KEY", critical: false, description: "OpenAI API key for AI insights (Growth/Pro feature)" },

  // ── App URL ───────────────────────────────────────────────────────────────
  { key: "NEXT_PUBLIC_SITE_URL", critical: false, description: "Public site URL — used in emails and checkout success URLs" },
];

export function validateEnv(): void {
  if (process.env.NODE_ENV === "test") return;

  const missing:  EnvVar[] = [];
  const warnings: EnvVar[] = [];

  for (const v of REQUIRED_VARS) {
    const val = process.env[v.key];
    if (!val || val.trim() === "") {
      if (v.critical) missing.push(v);
      else            warnings.push(v);
    }
  }

  // Extra check: ENCRYPTION_KEY must be ≥ 32 chars
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey && encKey.length < 32) {
    console.warn(
      `[env] ENCRYPTION_KEY is only ${encKey.length} chars — must be at least 32. ` +
      "OAuth tokens may not be encrypted correctly."
    );
  }

  // Verify Paddle environment value
  const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV;
  if (paddleEnv && !["sandbox", "production"].includes(paddleEnv)) {
    console.warn(
      `[env] NEXT_PUBLIC_PADDLE_ENV="${paddleEnv}" is invalid — must be "sandbox" or "production". Defaulting to sandbox.`
    );
  }

  if (warnings.length > 0) {
    console.warn(
      "\n[env] ⚠️  Missing optional environment variables (features may degrade):\n" +
      warnings.map((v) => `  • ${v.key} — ${v.description}`).join("\n") + "\n"
    );
  }

  if (missing.length > 0) {
    const msg =
      "\n[env] ❌ Missing CRITICAL environment variables — application cannot start:\n" +
      missing.map((v) => `  • ${v.key} — ${v.description}`).join("\n") + "\n" +
      "\nSet these in .env.local (development) or your deployment environment (production).\n";

    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.error(msg);
    }
  }
}
