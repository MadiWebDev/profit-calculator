import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGateway, dodoCancelSubscription, paddleCancelSubscription } from "@/lib/billing";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const teamId = (session.user as { teamId?: string }).teamId;
    if (!teamId) return NextResponse.json({ error: "No team found" }, { status: 400 });

    const sub = await SubscriptionModel.findOne({ teamId });
    if (!sub) return NextResponse.json({ error: "No active subscription" }, { status: 404 });

    const gateway = getGateway();
    if (gateway === "dodo") {
      await dodoCancelSubscription(sub.externalId);
    } else {
      await paddleCancelSubscription(sub.externalId);
    }

    sub.cancelAtPeriodEnd = true;
    await sub.save();

    await logAudit({
      teamId: new mongoose.Types.ObjectId(teamId),
      userId: new mongoose.Types.ObjectId(session.user.id as string),
      action: "subscription.cancelled",
      description: `Subscription cancelled (plan: ${sub.plan})`,
    });

    return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
  } catch (err) {
    console.error("Cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 });
  }
}
