/**
 * GET  /api/admin/users  — paginated list of all users for superAdmin panel
 * PATCH /api/admin/users — update a user's role or plan
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") return null;
  return session;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1", 10));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const search = searchParams.get("search")?.trim() ?? "";
  const plan   = searchParams.get("plan") ?? "";

  await connectDB();

  // Build filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (plan) filter.plan = plan;

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("name email role plan onboardingCompleted createdAt trialEndsAt teamId")
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  // Get active subscription info from teams in bulk
  const teamIds = users.map((u) => u.teamId).filter(Boolean);
  const teams = await TeamModel.find({ _id: { $in: teamIds } })
    .select("_id plan subscriptionId trialEndsAt")
    .lean();
  const teamMap = new Map(teams.map((t) => [t._id.toString(), t]));

  const rows = users.map((u) => {
    const team = u.teamId ? teamMap.get(u.teamId.toString()) : null;
    return {
      id:                   u._id.toString(),
      name:                 u.name,
      email:                u.email,
      role:                 u.role,
      plan:                 u.plan,
      onboardingCompleted:  u.onboardingCompleted,
      createdAt:            u.createdAt,
      trialEndsAt:          u.trialEndsAt ?? null,
      teamPlan:             team?.plan ?? null,
      hasSubscription:      !!team?.subscriptionId,
    };
  });

  // Plan summary stats
  const stats = await UserModel.aggregate([
    { $group: { _id: "$plan", count: { $sum: 1 } } },
  ]);

  return NextResponse.json({
    users: rows,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: stats.reduce((acc: Record<string, number>, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {}),
  });
}

// ── PATCH /api/admin/users ────────────────────────────────────────────────────
// Body: { userId, role?, plan? }
export async function PATCH(req: Request) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, role, plan } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (role && !["superAdmin", "owner"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (plan && !["free", "starter", "growth", "pro"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (role) update.role = role;
  if (plan) update.plan = plan;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true })
    .select("name email role plan");

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Keep team plan in sync if plan changed
  if (plan && user.teamId) {
    await TeamModel.findByIdAndUpdate(user.teamId, { $set: { plan } });
  }

  return NextResponse.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role, plan: user.plan } });
}
