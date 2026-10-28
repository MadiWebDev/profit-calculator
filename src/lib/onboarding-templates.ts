/**
 * Onboarding templates by store type (F1.14). Pure presets that
 * preconfigure fees, alerts and dashboard defaults — applied by the
 * onboarding flow, never silently overwriting a merchant's existing
 * settings (the caller merges, with existing values winning).
 */
export type StoreType = "dropshipping" | "pod" | "cod" | "branded-dtc";

export interface OnboardingTemplate {
  storeType: StoreType;
  label: string;
  defaultFees: { packaging: number; codFee: number; transactionFeePct: number };
  alertPresets: { name: string; metric: string; threshold: number }[];
  dashboardDefaults: string[];
  notes: string;
}

export const ONBOARDING_TEMPLATES: Record<StoreType, OnboardingTemplate> = {
  dropshipping: {
    storeType: "dropshipping", label: "Dropshipping",
    defaultFees: { packaging: 0.5, codFee: 0, transactionFeePct: 2.9 },
    alertPresets: [
      { name: "Margin below 15%", metric: "margin", threshold: 15 },
      { name: "RTO rate above 10%", metric: "rtoRate", threshold: 10 },
    ],
    dashboardDefaults: ["profit", "product-intel", "risk"],
    notes: "Watch supplier shipping times and RTO — they dominate dropshipping profit.",
  },
  pod: {
    storeType: "pod", label: "Print on demand",
    defaultFees: { packaging: 1.0, codFee: 0, transactionFeePct: 2.9 },
    alertPresets: [{ name: "Margin below 20%", metric: "margin", threshold: 20 }],
    dashboardDefaults: ["profit", "product-intel"],
    notes: "Base costs vary by print provider — set per-product COGS, not a flat rate.",
  },
  cod: {
    storeType: "cod", label: "Cash on delivery",
    defaultFees: { packaging: 0.5, codFee: 2.0, transactionFeePct: 0 },
    alertPresets: [
      { name: "RTO rate above 15%", metric: "rtoRate", threshold: 15 },
      { name: "Fake-order score above 70", metric: "riskScore", threshold: 70 },
    ],
    dashboardDefaults: ["profit", "risk", "couriers"],
    notes: "Enable COD tracking messages and the fake-order review queue from day one.",
  },
  "branded-dtc": {
    storeType: "branded-dtc", label: "Branded DTC",
    defaultFees: { packaging: 1.5, codFee: 0, transactionFeePct: 2.9 },
    alertPresets: [
      { name: "Margin below 25%", metric: "margin", threshold: 25 },
      { name: "Refund rate above 5%", metric: "refundRate", threshold: 5 },
    ],
    dashboardDefaults: ["profit", "ltv", "customers"],
    notes: "Lifetime value and repeat purchase matter more than first-order margin.",
  },
};
