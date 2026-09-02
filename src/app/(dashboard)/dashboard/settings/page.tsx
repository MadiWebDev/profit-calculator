import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import UserModel from "@/models/User";
import { SettingsClient } from "./SettingsClient";
import { PLAN_DISPLAY } from "@/lib/plans";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

async function getSettingsData(teamId: string, userId: string) {
  await connectDB();

  const [team, sub, stores, user] = await Promise.all([
    TeamModel.findById(teamId).lean(),
    SubscriptionModel.findOne({ teamId }).lean(),
    StoreModel.find({ teamId, isActive: true }).lean(),
    UserModel.findById(userId).select("name email image").lean(),
  ]);

  return {
    team: team
      ? {
          name: team.name,
          plan: team.plan,
          currency: team.currency,
          timezone: team.timezone,
        }
      : null,
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          interval: sub.interval,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          amount: sub.amount,
          currency: sub.currency,
          trialEndsAt: (sub as { trialEndsAt?: Date }).trialEndsAt?.toISOString(),
        }
      : null,
    stores: stores.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      platform: s.platform,
      syncStatus: s.syncStatus,
      lastSyncAt: s.lastSyncAt?.toISOString(),
      ordersCount: s.ordersCount,
      domain: s.domain,
    })),
    planDisplay: PLAN_DISPLAY,
    user: {
      name: (user as { name?: string } | null)?.name ?? "User",
      email: (user as { email?: string } | null)?.email ?? "",
      image: (user as { image?: string } | null)?.image,
    },
  };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as {
    id?: string;
    teamId?: string;
    plan?: UserPlan;
    role?: UserRole;
  };
  if (!user.teamId) redirect("/onboarding");

  const data = await getSettingsData(user.teamId, user.id ?? "");

  return (
    <SettingsClient
      data={data}
      userPlan={user.plan ?? "free"}
    />
  );
}
