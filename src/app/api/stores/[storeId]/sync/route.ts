import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * POST /api/stores/[storeId]/sync
 *
 * Triggered by the "Sync now" button in the dashboard Settings → Stores tab
 * and the Overview page's global sync button.
 *
 * Validates that the requesting user belongs to the team that owns the store,
 * then delegates to the platform-specific sync route fire-and-forget style so
 * the client gets an immediate 202 response.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { id?: string; teamId?: string };
  const teamId = user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const { storeId } = await params;

  await connectDB();

  // Verify ownership — only look up the platform, never expose credentials
  const store = await StoreModel.findOne({
    _id: storeId,
    teamId,
    isActive: true,
  }).select("platform").lean();

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Dispatch to the platform-specific sync route
  const syncEndpoint = platformSyncUrl(store.platform);
  if (!syncEndpoint) {
    return NextResponse.json(
      { error: `Sync not supported for platform: ${store.platform}` },
      { status: 400 }
    );
  }

  // Fire-and-forget — the sync can take many seconds for large stores
  fetch(syncEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId, teamId }),
  }).catch((e) =>
    console.warn(`[Sync Dispatch] ${store.platform} sync trigger failed (non-fatal)`, e)
  );

  return NextResponse.json({ queued: true, platform: store.platform });
}

function platformSyncUrl(platform: string): string | null {
  switch (platform) {
    case "shopify":
      return `${SITE_URL}/api/stores/shopify/sync`;
    case "woocommerce":
      return `${SITE_URL}/api/stores/woocommerce/sync`;
    case "etsy":
      return `${SITE_URL}/api/stores/etsy/sync`;
    default:
      return null;
  }
}
