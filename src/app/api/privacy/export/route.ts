import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { requireStepUpIf2fa } from "@/lib/step-up";
import { connectDB } from "@/lib/db";
import { toObjectId } from "@/lib/validation";
import OrderModel from "@/models/Order";
import ProductModel from "@/models/Product";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import { recordSecurityEvent } from "@/lib/security-events";

/**
 * GET /api/privacy/export — self-serve data export (S2.3, JSON).
 * Step-up required when the user has 2FA enabled. Mass-export events
 * are recorded as security events (S5). Export is the merchant's own
 * team-scoped data only — never another tenant's.
 */
export async function GET(req: Request) {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const stepUp = await requireStepUpIf2fa(req, session.userId, "data-export");
  if (stepUp) return stepUp;
  await connectDB();
  const teamOid = toObjectId(session.teamId);
  const [user, team, orders, products] = await Promise.all([
    UserModel.findById(session.userId).select("-password -twoFactorSecretEncrypted -twoFactorRecoveryHashes").lean(),
    TeamModel.findById(teamOid).select("-members.inviteTokenHash").lean(),
    OrderModel.find({ teamId: teamOid }).limit(10000).lean(),
    ProductModel.find({ teamId: teamOid }).limit(10000).lean(),
  ]);
  await recordSecurityEvent({ teamId: session.teamId, userId: session.userId, type: "mass_export", metadata: { orders: orders.length, products: products.length } });
  return NextResponse.json({ exportedAt: new Date().toISOString(), user, team, orders, products });
}
