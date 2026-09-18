import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware runs on the Edge Runtime — must only use edge-safe imports.
 * authConfig contains NO Node.js dependencies (no mongoose, bcrypt, crypto-js).
 * The `authorized` callback in authConfig handles all redirect logic.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico
     * - public files (ads.txt, images, etc.)
     * - API routes that must remain public (og image, billing webhooks)
     * - Shopify OAuth callback — Shopify redirects back here; the browser
     *   carries the session cookie so the user IS authenticated, but the
     *   middleware running before the route handler can sometimes fail to
     *   read the cookie on the Edge when the redirect has no cookie header.
     *   We validate the session inside the route handler instead.
     * - Etsy OAuth callback — same reason as Shopify above; Etsy redirects
     *   the browser back after OAuth and the session cookie may not be
     *   forwarded through the Edge middleware on the initial redirect hop.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|csv)$|api/og|api/billing/webhook|api/stores/shopify/callback|api/stores/etsy/callback).*)",
  ],
};
