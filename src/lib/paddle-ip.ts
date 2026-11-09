/**
 * paddle-ip.ts — Dynamic Paddle Webhook IP Verification
 *
 * Source of truth: https://api.paddle.com/ips
 * Paddle publishes their webhook egress IP addresses as /32 CIDRs.
 * We fetch and cache them with a 1-hour TTL, never hard-coding them.
 */

import { logger } from "@/lib/logger";

let cachedCidrs: string[] = [];
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Safe fallback list in case network fails on cold start
const FALLBACK_IPS = [
  "34.237.3.244",
  "34.195.105.136",
  "34.232.58.13",
  "35.155.119.135",
  "34.212.5.7",
  "52.11.166.252",
];

/**
 * Fetch current live webhook IPv4 addresses from Paddle.
 */
export async function getPaddleWebhookIps(): Promise<string[]> {
  const now = Date.now();
  if (cachedCidrs.length > 0 && now < cacheExpiresAt) {
    return cachedCidrs;
  }

  try {
    const res = await fetch("https://api.paddle.com/ips", {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const json = await res.json();
      const cidrs: string[] = json?.data?.ipv4_cidrs ?? [];
      // Clean '/32' suffix if present
      const cleanIps = cidrs.map((cidr) => cidr.replace(/\/32$/, "").trim());
      if (cleanIps.length > 0) {
        cachedCidrs = cleanIps;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return cleanIps;
      }
    }
  } catch (err) {
    logger.warn("paddle-ip: failed to fetch live IPs from https://api.paddle.com/ips, using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (cachedCidrs.length > 0) return cachedCidrs;
  return FALLBACK_IPS;
}

/**
 * Extract client IP from standard proxy headers.
 */
export function getClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // Left-most IP is the original client
    const ips = xForwardedFor.split(",").map((s) => s.trim());
    if (ips[0]) return ips[0];
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "";
}

/**
 * Verify whether an incoming webhook request originated from an official Paddle IP.
 */
export async function isPaddleWebhookIp(req: Request): Promise<boolean> {
  // Allow localhost / tests in development
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return true;
  }

  const clientIp = getClientIp(req);
  if (!clientIp) {
    // If no IP header is present in non-dev, reject
    return false;
  }

  // Local loopback
  if (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost") {
    return true;
  }

  const allowedIps = await getPaddleWebhookIps();
  return allowedIps.includes(clientIp);
}
