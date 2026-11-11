/**
 * Shared superAdmin guard for /api/admin/* routes. Same contract as the
 * requireSuperAdmin() duplicated in src/app/api/admin/users/route.ts and
 * src/app/api/admin/blogs/[id]/route.ts: returns the session when the
 * signed-in user is a superAdmin, otherwise null (callers answer 403).
 */
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import mongoose from "mongoose";

export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session.user as any).role;
  if (role !== "superAdmin") return null;
  return session;
}

/**
 * Resolve the admin's teamId for audit-log entries (AuditLog.teamId is
 * required). Prefers the teamId on the session, falls back to the User
 * document. Returns null when the admin has no team — callers skip the
 * audit entry in that case rather than failing the request.
 */
export async function resolveAdminTeamId(
  session: Awaited<ReturnType<typeof requireSuperAdmin>>
): Promise<mongoose.Types.ObjectId | null> {
  if (!session) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromSession = (session.user as any)?.teamId as string | undefined;
  if (fromSession && mongoose.Types.ObjectId.isValid(fromSession)) {
    return new mongoose.Types.ObjectId(fromSession);
  }
  try {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (session.user as any)?.id as string | undefined;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
    const user = await UserModel.findById(userId).select("teamId").lean();
    return user?.teamId ?? null;
  } catch {
    return null;
  }
}
