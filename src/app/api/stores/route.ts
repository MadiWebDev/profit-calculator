import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody, fail, toObjectId } from "@/lib/validation";
import { checkEntitlement } from "@/lib/entitlements";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { logger, toLogError } from "@/lib/logger";

const CreateStoreSchema = z
  .object({
    platform: z.enum(["shopify", "woocommerce", "etsy", "csv_manual"]),
    name: z.string().trim().min(1).max(120),
    domain: z.string().trim().max(255).optional(),
    wooSiteUrl: z.string().trim().url().max(255).optional(),
    accessToken: z.string().max(2048).optional(),
    refreshToken: z.string().max(2048).optional(),
  })
  .strict();

export async function GET() {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) return NextResponse.json({ stores: [] });

  const { checkSubscription } = await import("@/lib/api-helpers");
  const block = await checkSubscription(teamId);
  if (block) return block;

  await connectDB();
  const stores = await StoreModel.find({ teamId: toObjectId(teamId), isActive: true })
    .select("-accessToken -refreshToken")
    .lean();

  return NextResponse.json({ stores: stores.map((s) => ({ ...s, id: s._id.toString() })) });
}

export async function POST(req: Request) {
  const authed = await requireAuth(req, { rateLimitKey: "stores-create" });
  if (authed instanceof NextResponse) return authed;
  const { session } = authed;

  const parsed = await parseBody(req, CreateStoreSchema);
  if ("response" in parsed) return parsed.response;
  const { platform, name, domain, wooSiteUrl, accessToken, refreshToken } = parsed.data;

  // Plan limit: connected stores
  const ent = await checkEntitlement(session.teamId, "stores.connect");
  if ("response" in ent) return ent.response;

  try {
    await connectDB();

    const store = await StoreModel.create({
      teamId: toObjectId(session.teamId),
      name,
      platform,
      domain,
      wooSiteUrl,
      accessToken: accessToken ? encrypt(accessToken) : undefined,
      refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
      syncStatus: "never",
      isActive: true,
    });

    try {
      await logAudit({
        teamId: toObjectId(session.teamId),
        userId: toObjectId(session.userId),
        action: "store.connected",
        description: `Connected ${platform} store: ${name}`,
        resourceType: "Store",
        resourceId: store._id.toString(),
      });
    } catch (e) {
      logger.warn("audit log failed (non-fatal)", {}, toLogError(e));
    }

    return NextResponse.json(
      { id: store._id.toString(), name: store.name, platform: store.platform },
      { status: 201 }
    );
  } catch (err) {
    logger.error("store create failed", toLogError(err), { teamId: session.teamId });
    return fail("Failed to create store", 500, "STORE_CREATE_FAILED");
  }
}
