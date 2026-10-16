import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "google-ads-roi",
  title: "Google Ads ROI Calculator",
  shortTitle: "Google Ads ROI",
  description: "Calculate Google Ads ROI, CPA, profit per conversion, and break-even metrics in real time.",
  metaDescription: "Free Google Ads ROI calculator. Enter ad spend, conversions, average order value, conversion rate, and COGS to calculate CPA, ROI %, profit per conversion, and break-even metrics.",
  keywords: ["google ads roi calculator", "google ads profit calculator", "google ads cpa calculator", "ppc roi calculator", "google ads return on investment"],
  icon: "🎯",
  category: "advertising",
  relatedSlugs: ["meta-ads-roas", "shopify-profit", "amazon-fba-profit"],
  fields: [
    { name: "adSpend",         label: "Total Ad Spend",           type: "currency", defaultValue: 1000,  min: 0 },
    { name: "conversions",     label: "Total Conversions",        type: "number",   defaultValue: 50,    min: 1, helpText: "Total purchases / leads from your Google Ads" },
    { name: "avgOrderValue",   label: "Average Order Value (AOV)", type: "currency", defaultValue: 80,   min: 0 },
    { name: "conversionRate",  label: "Conversion Rate %",        type: "percent",  defaultValue: 2.5,   min: 0, max: 100, helpText: "% of clicks that convert to sales" },
    { name: "cogs",            label: "COGS per Order",           type: "currency", defaultValue: 25,    min: 0, helpText: "Product cost + shipping per conversion" },
    { name: "otherFees",       label: "Other Fees per Order",     type: "currency", defaultValue: 3,     min: 0, helpText: "Payment gateway, platform fees per order" },
  ],
  outputs: [
    { key: "cpa",              label: "Cost Per Acquisition",    format: "currency", highlight: true, description: "Ad Spend ÷ Conversions" },
    { key: "roi",              label: "ROI %",                   format: "percent",  highlight: true },
    { key: "profitPerConv",    label: "Profit Per Conversion",   format: "currency", highlight: true },
    { key: "totalRevenue",     label: "Total Revenue",           format: "currency" },
    { key: "totalProfit",      label: "Total Net Profit",        format: "currency" },
    { key: "roas",             label: "ROAS",                    format: "multiplier" },
    { key: "breakEvenCpa",     label: "Break-Even CPA",          format: "currency", description: "Max CPA before losing money" },
    { key: "breakEvenConvRate",label: "Break-Even Conv. Rate %", format: "percent",  description: "Minimum conversion rate to break even" },
  ],
  chartKeys: ["adSpend", "cogs", "otherFees", "totalProfit"],
  compute(v) {
    const totalRevenue = v.conversions * v.avgOrderValue;
    const totalCogs = v.conversions * (v.cogs + v.otherFees);
    const totalProfit = totalRevenue - v.adSpend - totalCogs;
    const cpa = v.conversions > 0 ? v.adSpend / v.conversions : 0;
    const profitPerConv = v.avgOrderValue - cpa - v.cogs - v.otherFees;
    const totalCosts = v.adSpend + totalCogs;
    const roi = totalCosts > 0 ? (totalProfit / totalCosts) * 100 : 0;
    const roas = v.adSpend > 0 ? totalRevenue / v.adSpend : 0;
    const breakEvenCpa = v.avgOrderValue - v.cogs - v.otherFees;
    const breakEvenConvRate = breakEvenCpa > 0 && v.avgOrderValue > 0 ? (v.adSpend / ((v.conversions / (v.conversionRate / 100)) * breakEvenCpa)) * 100 : 0;
    return { cpa, roi, profitPerConv, totalRevenue, totalProfit, roas, breakEvenCpa, breakEvenConvRate, adSpend: v.adSpend, cogs: totalCogs, otherFees: v.otherFees * v.conversions };
  },
  seoContent: {
    intro: `Google Ads is one of the most powerful customer acquisition channels — but it's also one of the easiest places to waste money. Understanding your true ROI requires factoring in not just ad spend and revenue, but also your product costs, platform fees, and conversion efficiency. This Google Ads ROI Calculator helps you instantly see whether your campaigns are genuinely profitable and what metrics to optimize.`,
    howToSteps: [
      "Enter your **total ad spend** for the period you want to analyze.",
      "Enter the **total number of conversions** (purchases) your Google Ads generated.",
      "Set your **average order value (AOV)** — the average revenue per transaction.",
      "Enter your **conversion rate %** — typically found in your Google Ads account.",
      "Add your **COGS per order** — product cost plus fulfillment cost per sale.",
      "Add any **other fees** like payment processing (e.g. 2.9% Stripe fee per order).",
      "Analyze your CPA, ROI, profit per conversion, and break-even conversion rate.",
    ],
    formula: `CPA = Ad Spend ÷ Conversions\n\nProfit Per Conversion = AOV − CPA − COGS − Fees\n\nROI % = ((Total Revenue − Total Costs) ÷ Total Costs) × 100\n\nBreak-Even CPA = AOV − COGS − Fees`,
    workedExample: `Ad spend: $1,000. Conversions: 50. AOV: $80. COGS: $25. Fees: $3.\n\nCPA = $1,000 ÷ 50 = $20\nProfit Per Conversion = $80 − $20 − $25 − $3 = $32\nTotal Revenue = 50 × $80 = $4,000\nTotal Costs = $1,000 + (50 × $28) = $2,400\nTotal Profit = $4,000 − $2,400 = $1,600\nROI = ($1,600 ÷ $2,400) × 100 = 66.7%`,
    faqs: [
      { q: "What is a good ROI for Google Ads?", a: "Most businesses target at least 100% ROI (2x return on investment), meaning every $1 spent returns $2. However, your acceptable ROI depends on your business model, margins, and customer lifetime value. SaaS businesses may accept negative ROI on first purchase if LTV is high." },
      { q: "What is CPA in Google Ads?", a: "CPA (Cost Per Acquisition) is the amount you spend on Google Ads to acquire one customer. A profitable CPA must be lower than your break-even CPA, which equals your AOV minus all non-ad costs (COGS + fees)." },
      { q: "How do I lower my Google Ads CPA?", a: "Lower CPA by improving Quality Score (better ad relevance + landing page), tightening audience targeting, using negative keywords to eliminate wasted spend, testing different ad copy, and optimizing your landing page conversion rate." },
      { q: "What is ROAS vs ROI in Google Ads?", a: "ROAS (Return on Ad Spend) = Revenue ÷ Ad Spend. ROI (Return on Investment) = (Net Profit ÷ Total Investment) × 100. ROI is a more complete profitability metric because it accounts for all costs, while ROAS only compares revenue to ad spend." },
      { q: "What is break-even CPA?", a: "Break-even CPA is the maximum you can pay per conversion without losing money. It equals your average order value minus COGS and all other costs. If your actual CPA is below this number, each conversion is profitable." },
    ],
  },
};

export default config;
