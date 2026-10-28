import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, toObjectId } from "@/lib/validation";
import { connectDB } from "@/lib/db";
import SessionDeviceModel from "@/models/SessionDevice";
import UserModel from "@/models/User";
import { recordSecurityEvent } from "@/lib/security-events";

/** GET /api/auth/sessions — list this user's devices/sessions. */
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  await connectDB();
  const devices = await SessionDeviceModel.find({ userId: toObjectId(session.userId) })
    .sort({ lastSeenAt: -1 }).limit(50).lean();
  return NextResponse.json({ devices: devices.map((d) => ({
    id: d._id.toString(), userAgent: d.userAgent, ipTruncated: d.ipTruncated,
    country: d.country, lastSeenAt: d.lastSeenAt, firstSeenAt: d.firstSeenAt,
    revokedAt: d.revokedAt, trustedUntil: d.trustedUntil,
  })) });
}

/** POST /api/auth/sessions — revoke one device, or all (revokeAll=true). */
export async function POST(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const parsed = await parseBody(req, z.object({ deviceId: z.string().min(1).max(64).optional(), revokeAll: z.boolean().optional().default(false) }).strict());
  if ("response" in parsed) return parsed.response;
  await connectDB();
  if (parsed.data.revokeAll) {
    await SessionDeviceModel.updateMany({ userId: toObjectId(session.userId), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    // Bumping sessionVersion invalidates every JWT (checked in auth.ts).
    await UserModel.findByIdAndUpdate(session.userId, { $inc: { sessionVersion: 1 } });
    await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "sessions_revoked_all" });
    return NextResponse.json({ revokedAll: true });
  }
  if (!parsed.data.deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  const device = await SessionDeviceModel.findOneAndUpdate(
    { _id: parsed.data.deviceId, userId: toObjectId(session.userId) },
    { $set: { revokedAt: new Date(), trustedUntil: undefined } },
  );
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "session_revoked", metadata: { deviceId: parsed.data.deviceId } });
  return NextResponse.json({ revoked: true });
}
