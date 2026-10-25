/**
 * Tenant blocklist (Phase 4) — hashed identifiers only.
 *
 * GET  /api/risk/blocklist — list kinds + counts (hashes are not
 *      useful to display, so only kind, reason and created date).
 * POST /api/risk/blocklist { kind, value, action: "add" | "remove" }
 *      — add or remove a hashed identifier. Raw values are hashed
 *        server-side and never stored.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, checkSubscription } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import BlocklistModel from "@/models/Blocklist";
import { hashIdentifier } from "@/lib/risk-scoring";

const BodySchema = z
  .object({
    kind: z.enum(["phone", "email", "address"]),
    value: z.string().trim().min(1).max(255),
    action: z.enum(["add", "remove"]),
  })
  .strict();

export async function GET(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-blocklist");
  if (rl) return rl;
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  await connectDB();
  const rows = await BlocklistModel.find({ teamId: toObjectId(session.teamId) })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("kind reason createdAt")
    .lean();
  return NextResponse.json({ blocklist: rows.map((r) => ({ ...r, id: r._id.toString() })) });
}

export async function POST(req: Request) {
  const rl = await withRateLimit(req, "standard", "risk-blocklist-post");
  if (rl) return rl;
  const result = await requireAuth(req, { permission: "write:data" });
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const block = await checkSubscription(session.teamId);
  if (block) return block;
  const parsed = await parseBody(req, BodySchema);
  if ("response" in parsed) return parsed.response;
  const { kind, value, action } = parsed.data;
  await connectDB();
  const valueHash = hashIdentifier(kind, value);
  if (action === "add") {
    await BlocklistModel.findOneAndUpdate(
      { teamId: toObjectId(session.teamId), kind, valueHash },
      { $set: { reason: "Manually added by merchant" } },
      { upsert: true }
    );
  } else {
    await BlocklistModel.deleteOne({ teamId: toObjectId(session.teamId), kind, valueHash });
  }
  return NextResponse.json({ ok: true, action, kind });
}
