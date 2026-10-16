/**
 * Startup environment validation — Zod-validated, fails fast at boot.
 *
 * validateEnv() lists ALL missing required vars in one error so deploys
 * don't die one variable at a time. Critical vars throw in production;
 * in development they log an error (so `next dev` still boots for UI work).
 *
 * Recommended (non-critical) vars produce warnings only.
 *
 * Call once at app boot — see src/instrumentation.ts.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";

const EnvSchema = z
  .object({
    // ── Auth ───────────────────────────────────────────────────────────────
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

    // ── Paddle (only payment gateway) ──────────────────────────────────────
    PADDLE_API_KEY: z.string().min(1, "PADDLE_API_KEY is required"),
    PADDLE_WEBHOOK_SECRET: z.string().min(1, "PADDLE_WEBHOOK_SECRET is required"),
    NEXT_PUBLIC_PADDLE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

    // ── Cron ───────────────────────────────────────────────────────────────
    CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 chars"),

    // ── Recommended (warn, don't fail) ─────────────────────────────────────
    ENCRYPTION_KEY: z.string().min(32).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    // ── Shopify ────────────────────────────────────────────────────────────
    SHOPIFY_CLIENT_ID: z.string().min(1).optional(),
    SHOPIFY_CLIENT_SECRET: z.string().min(1).optional(),

    // ── Etsy ───────────────────────────────────────────────────────────────
    ETSY_CLIENT_ID: z.string().min(1).optional(),
    ETSY_CLIENT_SECRET: z.string().min(1).optional(),

    // ── Meta Ads ───────────────────────────────────────────────────────────
    META_APP_ID: z.string().min(1).optional(),
    META_APP_SECRET: z.string().min(1).optional(),

    // ── TikTok Ads ─────────────────────────────────────────────────────────
    TIKTOK_APP_ID: z.string().min(1).optional(),
    TIKTOK_APP_SECRET: z.string().min(1).optional(),

    // ── Google Ads ─────────────────────────────────────────────────────────
    GOOGLE_ADS_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_ADS_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1).optional(),

    // ── Pinterest Ads ──────────────────────────────────────────────────────
    PINTEREST_APP_ID: z.string().min(1).optional(),
    PINTEREST_APP_SECRET: z.string().min(1).optional(),

    // ── Snapchat Ads ───────────────────────────────────────────────────────
    SNAPCHAT_CLIENT_ID: z.string().min(1).optional(),
    SNAPCHAT_CLIENT_SECRET: z.string().min(1).optional(),

    // ── Google sign-in (NextAuth) ──────────────────────────────────────────
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    // ── Misc ───────────────────────────────────────────────────────────────
    ENFORCE_CSRF: z.enum(["true", "false"]).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
    NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    USE_MOCK_ADS: z.enum(["true", "false"]).optional(),
  })
  .strict();

export type AppEnv = z.infer<typeof EnvSchema>;

const RECOMMENDED_VARS: Array<{ key: string; description: string }> = [
  { key: "ENCRYPTION_KEY", description: "AES-256 key — OAuth tokens stored unencrypted without it" },
  { key: "RESEND_API_KEY", description: "Transactional email (invites, alerts, receipts)" },
  { key: "OPENAI_API_KEY", description: "AI insights (Growth/Pro feature)" },
  { key: "NEXT_PUBLIC_SITE_URL", description: "Public site URL — used in emails and checkout success URLs" },
  { key: "SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET", description: "Shopify store OAuth" },
  { key: "ETSY_CLIENT_ID / ETSY_CLIENT_SECRET", description: "Etsy store OAuth" },
  { key: "META_APP_ID / META_APP_SECRET", description: "Meta Ads OAuth" },
  { key: "TIKTOK_APP_ID / TIKTOK_APP_SECRET", description: "TikTok Ads OAuth" },
  { key: "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_DEVELOPER_TOKEN", description: "Google Ads OAuth (requires approved developer token)" },
  { key: "PINTEREST_APP_ID / PINTEREST_APP_SECRET", description: "Pinterest Ads OAuth" },
  { key: "SNAPCHAT_CLIENT_ID / SNAPCHAT_CLIENT_SECRET", description: "Snapchat Ads OAuth" },
  { key: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", description: "Google sign-in via NextAuth" },
  { key: "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN", description: "Distributed rate limiting (falls back to in-memory)" },
];

let validated = false;

/**
 * Validate process.env against the schema. Fails fast at boot.
 * Safe to call multiple times — validates once.
 */
export function validateEnv(): AppEnv {
  if (validated) return process.env as unknown as AppEnv;
  if (process.env.NODE_ENV === "test") {
    validated = true;
    return process.env as unknown as AppEnv;
  }

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    const msg =
      `\n[env] Missing or invalid REQUIRED environment variables:\n${missing}\n\n` +
      `Set these in .env.local (development) or your deployment environment (production).\n` +
      `See .env.example for where to obtain each value.\n`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    logger.error("[env] required env vars invalid (continuing in dev)", { issues: parsed.error.issues.length });
    console.error(msg);
  }

  // Warn about recommended-but-missing vars
  const warnings: string[] = [];
  for (const v of RECOMMENDED_VARS) {
    const keys = v.key.split(" / ");
    const anySet = keys.some((k) => {
      const val = process.env[k];
      return typeof val === "string" && val.trim() !== "";
    });
    if (!anySet) warnings.push(`  • ${v.key} — ${v.description}`);
  }
  if (warnings.length > 0) {
    logger.warn("[env] optional env vars missing (features may degrade)", { count: warnings.length });
    console.warn(`\n[env] Missing optional environment variables (features may degrade):\n${warnings.join("\n")}\n`);
  }

  validated = true;
  return (parsed.success ? parsed.data : process.env) as AppEnv;
}

/** True when running with the full production-required env set. */
export function isEnvValid(): boolean {
  return EnvSchema.safeParse(process.env).success;
}
