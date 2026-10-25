/**
 * Owner security alerts (S5). Uses the existing Resend-based email path
 * when configured; silently no-ops otherwise (alerts are best-effort).
 * Recipients are team owners looked up from the DB — never from input.
 */
import { connectDB } from "@/lib/db";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import type { SecurityEventType } from "@/models/SecurityEvent";

export async function sendSecurityAlertEmail(teamId: string, type: SecurityEventType, metadata?: Record<string, unknown>): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await connectDB();
    const team = await TeamModel.findById(teamId).select("ownerId name").lean();
    if (!team?.ownerId) return;
    const owner = await UserModel.findById(team.ownerId).select("email name").lean();
    if (!owner?.email) return;
    const { sendOrderNotificationEmail } = await import("@/lib/email");
    await sendOrderNotificationEmail(
      owner.email,
      `[GetProfitCalc Security] ${type} on ${team.name ?? "your workspace"}`,
      `A security event was recorded: ${type}. Details: ${JSON.stringify(metadata ?? {})}. If this was not you, review your sessions in Settings > Security and revoke any unknown devices.`,
    );
  } catch {
    // best-effort
  }
}
