import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import UserModel from "@/models/User";
import AdAccountModel from "@/models/AdAccount";
import { SettingsClient } from "./SettingsClient";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

async function getSettingsData(teamId: string, userId: string) {
  await connectDB();

  const [team, sub, stores, user, adAccounts] = await Promise.all([
    TeamModel.findById(teamId).lean(),
    SubscriptionModel.findOne({ teamId }).lean(),
    StoreModel.find({ teamId, isActive: true }).lean(),
    UserModel.findById(userId).select("name email image phone displayCurrency timezone onboardingCompleted").lean(),
    AdAccountModel.find({ teamId, isActive: true }).lean(),
  ]);

  return {
    team: team
      ? {
          name:             team.name,
          plan:             team.plan,
          currency:         team.currency,
          timezone:         team.timezone,
          paddleCustomerId: team.paddleCustomerId,
        }
      : null,
    subscription: sub
      ? {
          plan:              sub.plan,
          status:            sub.status,
          interval:          sub.interval,
          currentPeriodEnd:  sub.currentPeriodEnd?.toISOString(),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          amount:            sub.amount,
          currency:          sub.currency,
          trialEndsAt:       (sub as { trialEndsAt?: Date }).trialEndsAt?.toISOString(),
        }
      : null,
    stores: stores.map((s) => ({
      id:          s._id.toString(),
      name:        s.name,
      platform:    s.platform,
      syncStatus:  s.syncStatus,
      lastSyncAt:  s.lastSyncAt ? new Date(s.lastSyncAt).toISOString() : undefined,
      ordersCount: s.ordersCount,
      domain:      s.domain,
    })),
    adAccounts: adAccounts.map((a) => ({
      id:          a._id.toString(),
      platform:    a.platform,
      accountId:   a.accountId,
      accountName: a.accountName,
      currency:    a.currency,
      syncStatus:  a.syncStatus,
      lastSyncAt:  a.lastSyncAt ? new Date(a.lastSyncAt).toISOString() : undefined,
    })),
    user: {
      name:  (user as { name?: string }  | null)?.name  ?? "User",
      email: (user as { email?: string } | null)?.email ?? "",
      image: (user as { image?: string } | null)?.image,
      phone: (user as { phone?: string } | null)?.phone ?? "",
      displayCurrency: (user as { displayCurrency?: string | null } | null)?.displayCurrency ?? null,
      timezone: (user as { timezone?: string | null } | null)?.timezone ?? null,
      onboardingCompleted: (user as { onboardingCompleted?: boolean } | null)?.onboardingCompleted ?? false,
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
  // Authoritative live plan takes priority over stale JWT token
  const effectivePlan = (data.subscription?.plan || data.team?.plan || user.plan || "free") as UserPlan;

  return (
    <SettingsClient
      data={data}
      userPlan={effectivePlan}
      userEmail={session.user.email ?? undefined}
      teamId={user.teamId ?? undefined}
      paddleCustomerId={data.team?.paddleCustomerId}
    />
  );
}
