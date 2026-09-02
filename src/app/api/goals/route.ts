import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import ProfitGoalModel from "@/models/ProfitGoal";
import mongoose from "mongoose";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id?: string; teamId?: string };
  if (!user.teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  try {
    const { month, targetProfit, targetRevenue, alertThreshold } = await req.json();
    if (!month || !targetProfit) return NextResponse.json({ error: "month and targetProfit are required" }, { status: 400 });

    await connectDB();

    const existing = await ProfitGoalModel.findOne({ teamId: user.teamId, month });
    if (existing) return NextResponse.json({ error: "A goal for this month already exists" }, { status: 409 });

    const goal = await ProfitGoalModel.create({
      teamId: user.teamId,
      month,
      targetProfit,
      targetRevenue: targetRevenue || undefined,
      currency: "USD",
      alerts: {
        enabled: true,
        email: true,
        profitBelowPercent: alertThreshold ?? 70,
      },
    });

    return NextResponse.json({ id: goal._id.toString() }, { status: 201 });
  } catch (err) {
    console.error("Goal create error:", err);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { teamId?: string };
  if (!user.teamId) return NextResponse.json({ goals: [] });

  await connectDB();
  const goals = await ProfitGoalModel.find({ teamId: user.teamId }).sort({ month: -1 }).lean();
  return NextResponse.json({ goals });
}
