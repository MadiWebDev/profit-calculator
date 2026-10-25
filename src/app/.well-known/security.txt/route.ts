import { NextResponse } from "next/server";

/** /.well-known/security.txt (S3.7, RFC 9116). Contact is the support
 * address already published on the site; no new inbox is invented here.
 * Update the Contact line in this file if the security inbox changes. */
export async function GET() {
  const body = [
    "Contact: https://www.getprofitcalc.com/contact",
    "Expires: 2027-10-26T00:00:00.000Z",
    "Preferred-Languages: en",
    "Policy: https://www.getprofitcalc.com/docs/security-disclosure",
    "",
  ].join("\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
