import type { BillingInterval } from "./billing";

export type PlanId = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  ordersPerMonth: number;   // -1 = unlimited
  stores: number;
  adPlatforms: number;
  aiInsights: boolean;
  aiInsightsFrequency: "none" | "weekly" | "realtime";
  teamMembers: number;
  csvImport: boolean;
  apiAccess: boolean;
  pdfReports: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    ordersPerMonth: 50,
    stores: 1,
    adPlatforms: 0,
    aiInsights: false,
    aiInsightsFrequency: "none",
    teamMembers: 1,
    csvImport: true,
    apiAccess: false,
    pdfReports: false,
  },
  starter: {
    ordersPerMonth: 100,
    stores: 1,
    adPlatforms: 1,
    aiInsights: false,
    aiInsightsFrequency: "none",
    teamMembers: 2,
    csvImport: true,
    apiAccess: false,
    pdfReports: false,
  },
  growth: {
    ordersPerMonth: 1000,
    stores: 2,
    adPlatforms: 3,
    aiInsights: true,
    aiInsightsFrequency: "weekly",
    teamMembers: 5,
    csvImport: true,
    apiAccess: false,
    pdfReports: true,
  },
  pro: {
    ordersPerMonth: -1,
    stores: -1,
    adPlatforms: -1,
    aiInsights: true,
    aiInsightsFrequency: "realtime",
    teamMembers: -1,
    csvImport: true,
    apiAccess: true,
    pdfReports: true,
  },
};

/**
 * Billing interval metadata.
 *
 * months          — how many calendar months this interval covers
 * discountPct     — percentage off the monthly rate
 * label           — human-readable toggle label
 * billedLabel     — "billed every X months / year" suffix shown under price
 */
export interface IntervalMeta {
  months: number;
  discountPct: number;
  label: string;
  billedLabel: string;
}

export const INTERVAL_META: Record<BillingInterval, IntervalMeta> = {
  monthly: {
    months: 1,
    discountPct: 0,
    label: "Monthly",
    billedLabel: "billed monthly",
  },
  quarterly: {
    months: 3,
    discountPct: 10,
    label: "3 Months",
    billedLabel: "billed every 3 months",
  },
  semiannual: {
    months: 6,
    discountPct: 15,
    label: "6 Months",
    billedLabel: "billed every 6 months",
  },
  annual: {
    months: 12,
    discountPct: 20,
    label: "1 Year",
    billedLabel: "billed annually",
  },
};

/**
 * Base monthly prices in cents (used as fallback when Paddle prices
 * cannot be fetched — the live Paddle price always takes precedence).
 */
export const PLAN_BASE_PRICES: Record<Exclude<PlanId, "free">, number> = {
  starter: 200,   // $2/mo
  growth:  900,   // $9/mo
  pro:     2500,  // $25/mo
};

/**
 * Compute the effective per-month price (in cents) for a given plan+interval,
 * applying the interval discount to the base monthly rate.
 *
 * This is a fallback for display purposes only. Actual charge amounts come
 * from Paddle and are fetched via /api/billing/prices.
 */
export function getEffectiveMonthlyPrice(
  plan: Exclude<PlanId, "free">,
  interval: BillingInterval
): number {
  const base = PLAN_BASE_PRICES[plan];
  const discount = INTERVAL_META[interval].discountPct / 100;
  return Math.round(base * (1 - discount));
}

/**
 * Total amount charged for one billing cycle (cents).
 */
export function getTotalCyclePrice(
  plan: Exclude<PlanId, "free">,
  interval: BillingInterval
): number {
  return getEffectiveMonthlyPrice(plan, interval) * INTERVAL_META[interval].months;
}

/**
 * Human-readable display metadata for the plan cards.
 * Prices shown here are static fallbacks — the /api/billing/prices
 * endpoint provides real Paddle prices.
 */
export const PLAN_DISPLAY = {
  starter: { name: "Starter", monthlyPrice: 2.00  },
  growth:  { name: "Growth",  monthlyPrice: 9.00  },
  pro:     { name: "Pro",     monthlyPrice: 25.00 },
} as const;

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export const ALL_INTERVALS: BillingInterval[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];
