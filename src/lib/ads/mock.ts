/**
 * Mock mode for ad-platform adapters — Phase 7.
 *
 * When AD_MOCK_MODE=true, sync libs return deterministic fixture data and
 * OAuth callbacks create fixture ad accounts instead of calling providers.
 * This makes the ads UI testable without provider apps/credentials.
 *
 * Mock data is deterministic per account id (seeded PRNG) so repeated
 * syncs produce identical rows — upserts stay idempotent.
 */
import { createHash } from "crypto";

export function isAdMockMode(): boolean {
  return process.env.AD_MOCK_MODE === "true";
}

export interface MockSpendRow {
  date: string; // YYYY-MM-DD
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seed: string): () => number {
  let h = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 30 days × 2 campaigns of deterministic fixture spend rows.
 * Newest day first is NOT guaranteed — callers should not rely on order.
 */
export function mockSpendRows(accountId: string, days = 30): MockSpendRow[] {
  const rand = seededRandom(`admock:${accountId}`);
  const rows: MockSpendRow[] = [];
  const today = new Date();

  for (let d = days; d >= 1; d--) {
    const date = new Date(today.getTime() - d * 864e5).toISOString().slice(0, 10);
    for (let c = 0; c < 2; c++) {
      const spend = Math.round((20 + rand() * 180) * 100) / 100;
      const impressions = Math.floor(1000 + rand() * 20000);
      const clicks = Math.floor(impressions * (0.005 + rand() * 0.02));
      const conversions = Math.floor(clicks * (0.02 + rand() * 0.08));
      const revenue = Math.round(spend * (1.5 + rand() * 3) * 100) / 100;
      rows.push({
        date,
        campaignId: `mock_campaign_${c + 1}`,
        campaignName: `Mock Campaign ${c + 1}`,
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
      });
    }
  }
  return rows;
}
