/**
 * /pricing — Server Component
 *
 * Reads the visitor's country from the Vercel edge header and passes it to
 * PricingClient so Paddle.PricePreview() can return localised prices.
 *
 * If the header is absent (local dev, non-Vercel host) we pass `undefined`
 * and let Paddle auto-detect the country from the visitor's IP.
 * We never pass a sentinel like "OTHERS" to Paddle.
 *
 * teamId is resolved server-side from the session and passed as a prop so
 * PricingClient can include it in Checkout.open customData.  The webhook
 * handler reads customData.teamId to provision the subscription — this is the
 * only safe way to carry it because:
 *   (a) it is server-side only (never trusted from client input), and
 *   (b) it is stamped on the Paddle transaction at the moment the overlay
 *       opens, so it arrives in every webhook event that follows.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTiers } from "@/lib/tiers";
import { PricingClient } from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing — GetProfitCalc",
  description:
    "Simple, transparent pricing for ecommerce profit tracking. " +
    "Start free for 7 days — no credit card required.",
};

export default async function PricingPage() {
  // ── Country detection ────────────────────────────────────────────────────
  // Vercel sets x-vercel-ip-country on every request to a 2-letter ISO code.
  // We only forward a valid 2-letter code; anything else → undefined so that
  // Paddle auto-detects from the visitor's IP instead.
  const headersList = await headers();
  const rawCountry  = headersList.get("x-vercel-ip-country");
  const countryCode: string | undefined =
    rawCountry && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : undefined;

  // ── Session — email prefills checkout; teamId stamps customData ──────────
  // teamId comes from the JWT (set at sign-in) — it is never trusted from the
  // request body or query string.  We pass it to PricingClient so it can be
  // included in Checkout.open({ customData: { teamId } }), which is how the
  // webhook handler knows which team to provision after payment.
  const session = await auth();
  const userSession = session?.user as {
    email?: string | null;
    teamId?: string | null;
  } | null;

  const userEmail = userSession?.email  ?? undefined;
  const teamId    = userSession?.teamId ?? undefined;

  // ── Tier config ──────────────────────────────────────────────────────────
  // getTiers() reads env vars and throws loudly if any are unset, so a
  // misconfigured deployment is caught at request time, not silently at pay time.
  const tiers = getTiers();

  return (
    <PricingClient
      tiers={tiers}
      countryCode={countryCode}
      userEmail={userEmail}
      teamId={teamId}
    />
  );
}
