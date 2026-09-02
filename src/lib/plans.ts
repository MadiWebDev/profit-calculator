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

export const PLAN_PRICES = {
  starter: { monthly: 200, annual: 1920 },   // cents
  growth:  { monthly: 900, annual: 8640 },
  pro:     { monthly: 2500, annual: 24000 },
};

export const PLAN_DISPLAY = {
  starter: { name: "Starter", price: 2,  annualPrice: 1.60 },
  growth:  { name: "Growth",  price: 9,  annualPrice: 7.20 },
  pro:     { name: "Pro",     price: 25, annualPrice: 20.00 },
};

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}
