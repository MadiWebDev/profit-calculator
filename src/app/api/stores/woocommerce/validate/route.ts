import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

/**
 * POST /api/stores/woocommerce/validate
 *
 * Pings the WooCommerce REST API with the supplied credentials to verify
 * they work before we save anything to the database.
 *
 * Body: { siteUrl: string; consumerKey: string; consumerSecret: string }
 * Returns: { ok: true; storeName: string; currency: string } on success
 *          { error: string } on failure
 */
export async function POST(req: Request) {
  const authResult = await requireAuth(req, { rateLimitKey: "woo-validate" });
  if (authResult instanceof NextResponse) return authResult;

  let body: { siteUrl?: string; consumerKey?: string; consumerSecret?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { siteUrl, consumerKey, consumerSecret } = body;

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json(
      { error: "siteUrl, consumerKey and consumerSecret are required" },
      { status: 400 }
    );
  }

  // Normalise the URL — strip trailing slash
  const baseUrl = siteUrl.trim().replace(/\/+$/, "");

  // Basic URL shape check
  try {
    new URL(baseUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL. Use the format: https://yourstore.com" },
      { status: 400 }
    );
  }

  // Ping the WooCommerce system status endpoint (lightweight, always available)
  const endpoint = `${baseUrl}/wp-json/wc/v3/system_status`;
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  let storeName = baseUrl;
  let currency = "USD";

  try {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      // 8 second timeout — enough for slow shared hosting
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { error: "Authentication failed. Check your Consumer Key and Consumer Secret." },
        { status: 400 }
      );
    }

    if (res.status === 404) {
      // WC REST API not reachable — likely wrong URL or pretty permalinks not set
      return NextResponse.json(
        {
          error:
            "WooCommerce REST API not found at that URL. Make sure:\n" +
            "1. The URL points to your WordPress root (e.g. https://yourstore.com)\n" +
            "2. Pretty Permalinks are enabled in WordPress Settings → Permalinks",
        },
        { status: 400 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `WooCommerce returned HTTP ${res.status}. Check your store URL and API keys.` },
        { status: 400 }
      );
    }

    const data = await res.json();
    storeName = data?.environment?.site_url
      ? new URL(data.environment.site_url).hostname
      : new URL(baseUrl).hostname;
    currency = data?.settings?.currency ?? "USD";
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Connection timed out. Check that the store URL is reachable." },
        { status: 400 }
      );
    }
    console.error("[WC Validate] fetch error", err);
    return NextResponse.json(
      { error: "Could not reach the store. Check the URL and try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, storeName, currency });
}
