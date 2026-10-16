import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * POST /api/stores/shopify/auth
 *
 * Initiates the Shopify OAuth flow.
 * 1. Validates the session and extracts teamId.
 * 2. Generates a random CSRF nonce, stores it in an HttpOnly cookie.
 * 3. Encodes { teamId, nonce } in the OAuth `state` param.
 * 4. Returns the Shopify authorization URL to the client.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "Your account has no workspace. Please complete registration." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const rawShop = (body.shop as string | undefined)?.trim() ?? "";
  if (!rawShop) {
    return NextResponse.json({ error: "shop is required" }, { status: 400 });
  }

  // Normalise the shop domain — strip protocol and trailing slashes
  const shop = rawShop
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();

  // Must look like <something>.myshopify.com
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
    return NextResponse.json(
      { error: "Invalid Shopify domain. Use the format: your-store.myshopify.com" },
      { status: 400 }
    );
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Shopify integration is not configured on this server." },
      { status: 503 }
    );
  }

  // Generate a cryptographically-random CSRF nonce
  const nonce = crypto.randomBytes(24).toString("hex");

  // Store nonce in a short-lived HttpOnly cookie (10 minutes)
  const cookieStore = await cookies();
  cookieStore.set("shopify_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const scopes =
    "read_orders,read_products,read_inventory,read_customers,read_fulfillments";
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/stores/shopify/callback`;

  // Encode teamId + nonce in state so the callback can verify both
  const state = Buffer.from(
    JSON.stringify({ teamId, nonce, shop })
  ).toString("base64url");

  const oauthUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return NextResponse.json({ oauthUrl });
}
