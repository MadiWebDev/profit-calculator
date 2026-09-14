import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import ApiKeyModel from "@/models/ApiKey";
import { ApiKeysClient } from "./ApiKeysClient";
import type { UserRole, UserPlan } from "@/components/dashboard/RoleContext";

async function getApiKeys(teamId: string) {
  await connectDB();
  const keys = await ApiKeyModel.find({ teamId, isActive: true })
    .select("-keyHash")
    .sort({ createdAt: -1 })
    .lean();

  return keys.map((k) => ({
    id: k._id.toString(),
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    usageCount: k.usageCount,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));
}

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = session.user as { id?: string; teamId?: string; plan?: UserPlan; role?: UserRole };
 
  // Hard gate: owner only
  if (!user.teamId) redirect("/onboarding");

  const keys = await getApiKeys(user.teamId);

  return <ApiKeysClient keys={keys} plan={user.plan ?? "free"} />;
}
