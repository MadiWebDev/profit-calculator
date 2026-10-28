import { createHash } from "crypto";
import { connectDB } from "@/lib/db";
import IdempotencyKeyModel from "@/models/IdempotencyKey";

export function idempotencyKeyHash(teamId: string, key: string): string {
  return createHash("sha256").update(`${teamId}:${key}`).digest("hex");
}

export async function getIdempotentResponse(teamId: string, key: string): Promise<{ status: number; body: Record<string, unknown> } | null> {
  await connectDB();
  const rec = await IdempotencyKeyModel.findOne({ teamId, keyHash: idempotencyKeyHash(teamId, key) }).lean();
  if (!rec) return null;
  return { status: rec.responseStatus, body: rec.responseBody };
}

export async function storeIdempotentResponse(teamId: string, key: string, status: number, body: Record<string, unknown>): Promise<void> {
  try {
    await connectDB();
    await IdempotencyKeyModel.updateOne(
      { teamId, keyHash: idempotencyKeyHash(teamId, key) },
      { $set: { responseStatus: status, responseBody: body, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
      { upsert: true },
    );
  } catch {
    // Idempotency storage failure must not fail the original write.
  }
}
