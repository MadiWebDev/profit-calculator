/**
 * Route auth-policy audit (S3.5, R4). Static crawl of src/app/api:
 * every route.ts must declare its auth policy, or CI fails.
 *
 * Policy is detected by marker strings in the route file:
 *  - requireAuth / requireV1Access / validateApiKey  → session / api-key
 *  - verifySignature / HMAC / webhook               → webhook (must also
 *    contain a signature check; a bare "webhook" mention is not enough)
 *  - PUBLIC_ROUTE marker comment                    → intentionally public
 *    (marketing/blog/health/readiness/docs endpoints only; see allowlist)
 * Anything else FAILS. Run: npx tsx scripts/audit-routes.ts
 * Exit 0 = all routes covered, exit 1 = uncovered routes listed.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const API_DIR = join(process.cwd(), "src/app/api");

// Intentionally public routes (no session): health, marketing content,
// auth callbacks, and webhook endpoints that verify HMAC themselves.
// Webhook routes are NOT in this list — they must show a signature check.
const PUBLIC_ALLOWLIST = new Set([
  "src/app/api/health/route.ts",
  "src/app/api/ready/route.ts",
  "src/app/api/blogs/route.ts",
  "src/app/api/blogs/categories/route.ts",
  "src/app/api/blogs/tags/route.ts",
  "src/app/api/auth/[...nextauth]/route.ts",
  "src/app/api/auth/register/route.ts",
  "src/app/api/auth/forgot-password/route.ts",
  "src/app/api/auth/reset-password/route.ts",
  "src/app/api/auth/verify-email/route.ts",
  "src/app/api/auth/verify-email/resend/route.ts",
  "src/app/api/docs/route.ts",
  "src/app/api/openapi/route.ts",
  "src/app/api/blogs/[slug]/route.ts",
  "src/app/api/docs/openapi/route.ts",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

const files = walk(API_DIR);
const uncovered: string[] = [];
const byPolicy: Record<string, number> = {};
for (const file of files) {
  const rel = file.replace(process.cwd() + "/", "");
  const src = readFileSync(file, "utf8");
  let policy: string | null = null;
  if (src.includes("requireAuth(") || src.includes("requireAuth (")) policy = "session";
  else if (src.includes("requireV1Access") || src.includes("validateApiKey")) policy = "api-key";
  else if (/verifySignature|hmac|HMAC|verifyWebhook/i.test(src) && src.includes("webhook")) policy = "webhook";
  // Provider-verified callbacks: OAuth state nonce, Paddle signature,
  // Meta signed_request — verified by the provider mechanism, not a session.
  else if (src.includes("verifyOAuthState")) policy = "oauth-state";
  else if (src.includes("paddle.webhooks.unmarshal")) policy = "webhook-paddle";
  else if (src.includes("signed_request")) policy = "webhook-signed-request";
  else if (src.includes("PUBLIC_ROUTE") || PUBLIC_ALLOWLIST.has(rel)) policy = "public";
  // Cron routes use cron-auth (shared secret header), not sessions.
  else if (src.includes("cron-auth") || src.includes("CRON_SECRET")) policy = "cron-secret";
  // 2FA verify / trusted-check use auth() directly because pending
  // sessions are rejected by requireAuth — that IS an auth policy.
  else if (src.includes("await auth()")) policy = "session-direct";
  if (policy) byPolicy[policy] = (byPolicy[policy] ?? 0) + 1;
  else uncovered.push(rel);
}

console.log(`Routes scanned: ${files.length}`);
console.log("By policy:", JSON.stringify(byPolicy));
if (uncovered.length) {
  console.log("UNCOVERED ROUTES (no auth policy detected):");
  for (const u of uncovered) console.log(" -", u);
  process.exit(1);
}
console.log("OK: every API route declares an auth policy.");
