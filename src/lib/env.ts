/**
 * Startup environment variable validation.
 * Call once at app boot (e.g. in instrumentation.ts or top of db.ts).
 *
 * Critical vars cause a hard error.
 * Recommended vars log a warning — app still starts, but features may degrade.
 */

interface EnvVar {
  key: string;
  critical: boolean;
  description: string;
}

const REQUIRED_VARS: EnvVar[] = [
  // Auth
  { key: "AUTH_SECRET",           critical: true,  description: "NextAuth session signing secret" },
  { key: "MONGODB_URI",           critical: true,  description: "MongoDB connection string" },
  // Billing
  { key: "DODO_WEBHOOK_SECRET",   critical: false, description: "Dodo Payments webhook HMAC secret (required for Dodo gateway)" },
  { key: "PADDLE_WEBHOOK_SECRET", critical: false, description: "Paddle webhook HMAC secret (required for Paddle gateway)" },
  // Encryption
  { key: "ENCRYPTION_KEY",        critical: false, description: "AES-256 key for encrypting OAuth tokens in DB (32-char hex)" },
  // Email
  { key: "RESEND_API_KEY",        critical: false, description: "Resend API key for transactional email" },
  // AI
  { key: "OPENAI_API_KEY",        critical: false, description: "OpenAI API key for AI insights (Growth/Pro plan feature)" },
  // App URL
  { key: "NEXT_PUBLIC_SITE_URL",  critical: false, description: "Public site URL — used in emails and OG images" },
];

export function validateEnv(): void {
  // Only validate in non-test environments
  if (process.env.NODE_ENV === "test") return;

  const missing: EnvVar[] = [];
  const warnings: EnvVar[] = [];

  for (const v of REQUIRED_VARS) {
    const val = process.env[v.key];
    if (!val || val.trim() === "") {
      if (v.critical) missing.push(v);
      else warnings.push(v);
    }
  }

  // Specific checks
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey && encKey.length < 32) {
    console.warn(
      `[env] ENCRYPTION_KEY is only ${encKey.length} chars — must be at least 32. ` +
      "OAuth tokens may not be encrypted correctly."
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

    // In production throw hard; in development just log so the dev sees the message clearly
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.error(msg);
    }
  }
}
