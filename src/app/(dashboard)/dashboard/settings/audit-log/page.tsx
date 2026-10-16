import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import AuditLogModel from "@/models/AuditLog";
import UserModel from "@/models/User";
import { AuditLogClient } from "./AuditLogClient";
import mongoose from "mongoose";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

const PAGE_SIZE = 50;

async function getAuditLogs(teamId: string, page: number, action?: string) {
  await connectDB();

  const filter: Record<string, unknown> = {
    teamId: new mongoose.Types.ObjectId(teamId),
  };
  if (action) filter.action = action;

  const [logs, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  // Resolve user names for display
  const userIds = [...new Set(logs.map((l) => l.userId?.toString()).filter(Boolean))];
  const users = await UserModel.find({ _id: { $in: userIds } }).select("name email").lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), { name: u.name, email: u.email }]));

  return {
    logs: logs.map((l) => {
      const u = userMap.get(l.userId?.toString() ?? "");
      return {
        id: l._id.toString(),
        action: l.action,
        description: l.description,
        resourceType: l.resourceType ?? null,
        resourceId: l.resourceId ?? null,
        ipAddress: l.ipAddress ?? null,
        createdAt: l.createdAt.toISOString(),
        user: u ? { name: u.name, email: u.email } : null,
      };
    }),
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    page,
  };
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { page?: string; action?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { id?: string; teamId?: string; plan?: UserPlan; role?: UserRole };


  if (!user.teamId) redirect("/onboarding");

  const page   = Math.max(1, parseInt((await searchParams).page ?? "1"));
  const action = (await searchParams).action ?? "";

  const data = await getAuditLogs(user.teamId, page, action || undefined);

  return <AuditLogClient data={data} />;
}
