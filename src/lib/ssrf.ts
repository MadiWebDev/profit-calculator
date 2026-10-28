/**
 * SSRF guard (R6). Validate a user-supplied URL before any outbound fetch:
 * HTTPS only, no credentials in URL, host resolves (DNS) to a public IP,
 * and the resolved IP is re-checked against private/loopback/link-local/
 * cloud-metadata ranges (anti DNS-rebinding: resolve, check, then fetch
 * with the resolved host where possible — callers that use fetch() must
 * re-resolve immediately before fetching; see validateOutboundUrl's
 * `resolvedIp` return, and prefer the returned host).
 *
 * Pure checks (scheme/host/IP-literal) run synchronously; DNS checks are
 * async and use the system resolver. In tests, pass a fake resolver.
 */
import { lookup } from "dns/promises";
import { isIP } from "net";

export const BLOCKED_CIDRS: Array<[number, number, number]> = [
  // [first octet range start, mask bits handled below via prefix match]
  [10, 0, 8],
  [172, 16, 12],
  [192, 168, 16],
  [127, 0, 8],
  [169, 254, 16], // link-local + cloud metadata 169.254.169.254
  [0, 0, 8],
  [100, 64, 10], // CGNAT
  [192, 0, 24], // IETF protocol assignments (incl. 192.0.2.0/24 TEST-NET)
  [198, 18, 15], // benchmarking
  [224, 0, 4], // multicast
  [240, 0, 4], // reserved
];

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  // Prefix checks: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8,
  // 100.64/10, 192.0.0/24-ish, 198.18/15, 224/4, 240/4
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return !ipv4Blocked(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    // loopback, link-local, unique-local, documentation, unspecified
    if (lower === "::1" || lower === "::") return false;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return false;
    if (lower.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

export interface OutboundCheck {
  ok: boolean;
  reason?: string;
  resolvedIp?: string;
}

export async function validateOutboundUrl(
  rawUrl: string,
  resolver: (host: string) => Promise<string[]> = async (host) => {
    const results = await lookup(host, { all: true });
    return results.map((r) => r.address);
  },
): Promise<OutboundCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL not allowed" };
  const host = url.hostname;
  if (!host) return { ok: false, reason: "missing host" };
  if (isIP(host)) {
    if (!isPublicIp(host)) return { ok: false, reason: "private/reserved IP blocked" };
    return { ok: true, resolvedIp: host };
  }
  let ips: string[];
  try {
    ips = await resolver(host);
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
  if (!ips.length) return { ok: false, reason: "DNS resolution failed" };
  // ALL resolved addresses must be public — a single private answer is a
  // rebinding attempt, not a reason to pick the public one.
  for (const ip of ips) {
    if (!isPublicIp(ip)) return { ok: false, reason: `resolved IP ${ip} is private/reserved` };
  }
  return { ok: true, resolvedIp: ips[0] };
}

/** Sign an outbound webhook payload: timestamp + HMAC-SHA256 (R6). */
export function signOutboundWebhook(secret: string, body: string, timestamp = Date.now()): { signature: string; timestamp: number } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("crypto");
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return { signature, timestamp };
}

export function verifyOutboundWebhook(secret: string, body: string, timestamp: number, signature: string, toleranceMs = 5 * 60 * 1000): boolean {
  if (Math.abs(Date.now() - timestamp) > toleranceMs) return false;
  const expected = signOutboundWebhook(secret, body, timestamp).signature;
  if (expected.length !== signature.length) return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { timingSafeEqual } = require("crypto");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
