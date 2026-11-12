/**
 * GET /api/geo/currency — location auto-detect for the display currency.
 *
 * Reads Vercel's `x-vercel-ip-country` request header (set on every
 * request in production) and maps the ISO country code to a currency
 * via src/lib/country-currency.ts. Returns:
 *   { country: "PK", currency: "PKR", source: "vercel-geo" }
 * or, when the header is absent (local dev, non-Vercel deploys):
 *   { country: null, currency: null, source: "none" }
 *
 * Privacy: country + currency only. No IP address is read, stored,
 * or logged (the header carries a country code, not an IP). No auth
 * required — no user data is involved — and no database access.
 * `private, no-store` because the answer varies per visitor and must
 * never be shared between them.
 *
 * This is a display default only: the client uses it solely when no
 * saved user preference, team setting, or browser choice exists, and
 * a saved preference always wins over it.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { currencyForCountry } from "@/lib/country-currency";

export async function GET() {
  const headersList = await headers();
  const country = headersList.get("x-vercel-ip-country");
  const currency = country ? currencyForCountry(country) : null;

  return NextResponse.json(
    {
      country: country ? country.toUpperCase() : null,
      currency,
      source: currency ? "vercel-geo" : "none",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
