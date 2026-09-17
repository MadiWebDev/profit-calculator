import type { CalculatorConfig } from "@/types/calculator";
import shopifyProfit from "./shopify-profit";
import metaAdsRoas from "./meta-ads-roas";
import googleAdsRoi from "./google-ads-roi";
import dropshippingProfit from "./dropshipping-profit";
import amazonFbaProfit from "./amazon-fba-profit";
import freelancerProfit from "./freelancer-profit";
import profitMargin from "./profit-margin";
import rentalPropertyRoi from "./rental-property-roi" 
export const calculators: CalculatorConfig[] = [
  shopifyProfit,
  metaAdsRoas,
  googleAdsRoi,
  dropshippingProfit,
  amazonFbaProfit,
  freelancerProfit,
  profitMargin,
  rentalPropertyRoi
];

export const calculatorMap: Record<string, CalculatorConfig> = Object.fromEntries(
  calculators.map((c) => [c.slug, c])
);

export function getCalculator(slug: string): CalculatorConfig | undefined {
  return calculatorMap[slug];
}

export function getRelatedCalculators(slug: string, limit = 3): CalculatorConfig[] {
  const config = calculatorMap[slug];
  if (!config) return [];
  const slugs = config.relatedSlugs ?? [];
  return slugs
    .map((s) => calculatorMap[s])
    .filter(Boolean)
    .slice(0, limit) as CalculatorConfig[];
}

export { shopifyProfit, metaAdsRoas, googleAdsRoi, dropshippingProfit, amazonFbaProfit, freelancerProfit, profitMargin };
