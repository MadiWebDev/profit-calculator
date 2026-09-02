/**
 * Validates a public API key from Authorization: Bearer header.
 * Used by /api/v1/* routes.
 */
import { createHash } from "crypto";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { rateLimit } from "@/lib/rate-limit";

export interface ApiKeySession {
  teamId: string;
  scopes: string[];
  keyId: string;
}

export async function validateApiKey(req: Request): Promise<ApiKeySession | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer pc_live_")) return null;

  const raw = auth.slice(7); // strip "Bearer "

  // Rate limit per key prefix
  const prefix = raw.slice(0, 12);
  const rl = await Promise.resolve(rateLimit(`apikey:${prefix}`));
  if (!rl.ok) return null;

  const hash = createHash("sha256").update(raw).digest("hex");

  await connectDB();
  const key = await ApiKeyModel.findOne({ keyHash: hash, isActive: true });
  if (!key) return null;

  // Check expiry
  if (key.expiresAt && new Date() > key.expiresAt) return null;

  // Update usage stats (non-blocking)
  ApiKeyModel.findByIdAndUpdate(key._id, {
    $inc: { usageCount: 1 },
    $set: { lastUsedAt: new Date() },
  }).exec().catch(() => {});

  return {
    teamId: key.teamId.toString(),
    scopes: key.scopes,
    keyId: key._id.toString(),
  };
}

export function hasScope(session: ApiKeySession, required: string): boolean {
  return session.scopes.includes(required);
}
