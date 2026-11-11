/**
 * GET /api/admin/teams — minimal team list (id, name, plan) for the
 * admin campaign audience selector. superAdmin-only.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import { requireSuperAdmin } from "@/lib/admin-auth";

export async function GET() {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const teams = await TeamModel.find({})
    .sort({ name: 1 })
    .limit(100)
    .select("name plan")
    .lean();

  return NextResponse.json({
    teams: teams.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      plan: t.plan,
    })),
  });
}
