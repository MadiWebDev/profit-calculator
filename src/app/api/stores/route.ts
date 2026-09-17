import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkSubscription } from "@/lib/api-helpers";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) return NextResponse.json({ stores: [] });

  const block = await checkSubscription(teamId);
  if (block) return block;

  await connectDB();
  const stores = await StoreModel.find({ teamId, isActive: true })
    .select("-accessToken -refreshToken")
    .lean();

  return NextResponse.json({ stores: stores.map((s) => ({ ...s, id: s._id.toString() })) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const block = await checkSubscription(user.teamId);
  if (block) return block;

  try {
    const body = await req.json();
    const { platform, name, wooSiteUrl, accessToken, refreshToken, domain } = body;

    if (!platform || !name) return NextResponse.json({ error: "platform and name are required" }, { status: 400 });

    await connectDB();

    const store = await StoreModel.create({
      teamId: user.teamId,
      name,
      platform,
      domain,
      wooSiteUrl,
      accessToken: accessToken ? encrypt(accessToken) : undefined,
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      syncStatus: "never",
      isActive: true,
    });

    await logAudit({
      teamId: new mongoose.Types.ObjectId(user.teamId),
      userId: new mongoose.Types.ObjectId(user.id!),
      action: "store.connected",
      description: `Connected ${platform} store: ${name}`,
      resourceType: "Store",
      resourceId: store._id.toString(),
    });

    return NextResponse.json({ id: store._id.toString(), name: store.name, platform: store.platform }, { status: 201 });
  } catch (err) {
    console.error("Store create error:", err);
    return NextResponse.json({ error: "Failed to create store" }, { status: 500 });
  }
}
