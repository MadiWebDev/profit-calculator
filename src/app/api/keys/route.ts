import { NextResponse } from "next/server";
import { requireAuth, requirePlan } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { logAudit } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";
import mongoose from "mongoose";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// GET — list keys for team (no secrets shown)
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const planCheck = requirePlan(session, "pro");
  if (planCheck) return planCheck;

  await connectDB();
  const keys = await ApiKeyModel.find({ teamId: session.teamId, isActive: true })
    .select("-keyHash")
    .lean();

  return NextResponse.json({ keys });
}

// POST — create new key
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const planCheck = requirePlan(session, "pro");
  if (planCheck) return planCheck;

  const { name, scopes = ["read:orders", "read:products", "read:reports"], expiresIn } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  await connectDB();

  const existingCount = await ApiKeyModel.countDocuments({ teamId: session.teamId, isActive: true });
  if (existingCount >= 10) {
    return NextResponse.json({ error: "Maximum 10 API keys per team. Revoke unused keys first." }, { status: 429 });
  }

  // Generate key: pc_live_<32 random hex chars>
  const rawKey = `pc_live_${randomBytes(20).toString("hex")}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000)
    : undefined;

  const apiKey = await ApiKeyModel.create({
    teamId: session.teamId,
    createdBy: session.userId,
    name,
    keyHash,
    keyPrefix,
    scopes,
    expiresAt,
  });

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "api_key.created",
    description: `Created API key "${name}"`,
    resourceType: "ApiKey",
    resourceId: apiKey._id.toString(),
  });

  // Return raw key ONCE — never stored in plain text
  return NextResponse.json({
    id:     apiKey._id.toString(),
    name,
    key:    rawKey,   // ⚠️ Only shown once
    prefix: keyPrefix,
    scopes,
  }, { status: 201 });
}

// DELETE — revoke key
export async function DELETE(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await connectDB();
  await ApiKeyModel.findOneAndUpdate(
    { _id: id, teamId: session.teamId },
    { isActive: false }
  );

  await logAudit({
    teamId: new mongoose.Types.ObjectId(session.teamId),
    userId: new mongoose.Types.ObjectId(session.userId),
    action: "api_key.revoked",
    description: `Revoked API key ${id}`,
  });

  return NextResponse.json({ success: true });
}
