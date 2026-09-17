import type { CalculatorConfig } from "@/types/calculator";
import shopifyProfit from "./shopify-profit";
import metaAdsRoas from "./meta-ads-roas";
import googleAdsRoi from "./google-ads-roi";
import dropshippingProfit from "./dropshipping-profit";
import amazonFbaProfit from "./amazon-fba-profit";
import freelancerProfit from "./freelancer-profit";
import profitMargin from "./profit-margin";
import rentalPropertyRoi from "./rental-property-roi"; 
import burnRateRunway from "./burn-rate-runway";
import dividendYield from "./dividend-yield";
import cryptoStakingRoi from "./crypto-staking-roi";
import capRate from "./cap-rate";
import compoundInterest from "./compound-interest";
import breakEvenPoint from "./break-even-point";
import cryptoProfit from "./crypto-profit";
import dollarCostAveraging from "./dollar-cost-averaging";
import etfFeeImpact from "./etf-fee-impact";
import foodCostPercentage from "./food-cost-percentage";
import houseFlippingProfit from "./house-flipping-profit";
import ltvCac from "./ltv-cac";
import menuPrice from "./menu-price";
import mortgageAffordability from "./mortgage-affordability";
import propertyManagementFee from "./property-management-fee"; 
import rentVsBuy from "./rent-vs-buy";
import restaurantProfitMargin from "./restaurant-profit-margin";
import retailMarkup from "./retail-markup";
import saasChurnCost from "./saas-churn-cost";
import saasMrr from "./saas-mrr";
import saasPricingMargin from "./saas-pricing-margin";
import stockProfit from "./stock-profit";
import subscriptionBoxProfit from "./subscription-box-profit";
import taxOnSale from "./tax-on-sale";
import valuationMultiple from "./valuation-multiple";


export const calculators: CalculatorConfig[] = [
  shopifyProfit,
  metaAdsRoas,
  googleAdsRoi,
  dropshippingProfit,
  amazonFbaProfit,
  freelancerProfit,
  profitMargin,
  rentalPropertyRoi,
  burnRateRunway,
  dividendYield,
  cryptoStakingRoi,
  capRate,
  compoundInterest,
  breakEvenPoint,
  cryptoProfit,
  dollarCostAveraging,
  etfFeeImpact,
  foodCostPercentage,
  houseFlippingProfit,
  ltvCac,
  menuPrice,
  mortgageAffordability,
  propertyManagementFee,
  rentVsBuy,
  restaurantProfitMargin,
  retailMarkup,
  saasChurnCost,
  saasMrr,
  saasPricingMargin,
  stockProfit,
  subscriptionBoxProfit,
  taxOnSale,
  valuationMultiple,
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
