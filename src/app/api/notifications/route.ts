import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import NotificationModel from "@/models/Notification";
import mongoose from "mongoose";

// GET /api/notifications?unread=true&limit=20
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

  await connectDB();
  const query: Record<string, unknown> = { teamId: session.teamId };
  if (unreadOnly) query.read = false;

  const [notifications, unreadCount] = await Promise.all([
    NotificationModel.find(query).sort({ createdAt: -1 }).limit(limit).lean(),
    NotificationModel.countDocuments({ teamId: session.teamId, read: false }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications — mark as read
export async function PATCH(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const { ids, markAllRead } = await req.json();
  await connectDB();

  if (markAllRead) {
    await NotificationModel.updateMany({ teamId: session.teamId, read: false }, { read: true });
    return NextResponse.json({ updated: "all" });
  }

  if (Array.isArray(ids) && ids.length) {
    await NotificationModel.updateMany(
      { _id: { $in: ids.map((id: string) => new mongoose.Types.ObjectId(id)) }, teamId: session.teamId },
      { read: true }
    );
    return NextResponse.json({ updated: ids.length });
  }

  return NextResponse.json({ error: "Provide ids or markAllRead" }, { status: 400 });
}

// DELETE /api/notifications?id=xxx (single) or DELETE all read
export async function DELETE(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof Response) return result;
  const { session } = result;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const clearRead = searchParams.get("clearRead") === "true";

  await connectDB();

  if (id) {
    await NotificationModel.deleteOne({ _id: id, teamId: session.teamId });
  } else if (clearRead) {
    await NotificationModel.deleteMany({ teamId: session.teamId, read: true });
  }

  return NextResponse.json({ success: true });
}
