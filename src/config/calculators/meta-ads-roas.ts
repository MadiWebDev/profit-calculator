import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "meta-ads-roas",
  title: "Facebook / Meta Ads ROAS & Profit Calculator",
  shortTitle: "Meta Ads ROAS",
  description: "Calculate your Facebook and Instagram ad ROAS, net profit, CPA, and break-even ROAS instantly.",
  metaDescription: "Free Facebook Ads ROAS calculator. Enter your ad spend, revenue, COGS, and platform fees to calculate ROAS, net profit after ad spend, cost per acquisition, and break-even ROAS.",
  keywords: ["facebook ads roas calculator", "meta ads profit calculator", "facebook ads roi calculator", "roas calculator", "break even roas calculator"],
  icon: "📘",
  category: "advertising",
  relatedSlugs: ["google-ads-roi", "shopify-profit", "dropshipping-profit"],
  fields: [
    { name: "adSpend",       label: "Total Ad Spend",         type: "currency", defaultValue: 500,   min: 0, helpText: "Total amount spent on Meta Ads in this period" },
    { name: "revenue",       label: "Revenue Generated",      type: "currency", defaultValue: 2000,  min: 0, helpText: "Total sales revenue attributed to these ads" },
    { name: "cogs",          label: "Cost of Goods Sold (COGS)", type: "currency", defaultValue: 600, min: 0, helpText: "Total product cost for units sold from these ads" },
    { name: "platformFees",  label: "Platform / Processing Fees", type: "currency", defaultValue: 60, min: 0, helpText: "Payment processing, Shopify fees, etc." },
    { name: "conversions",   label: "Number of Conversions",  type: "number",   defaultValue: 40,    min: 1, helpText: "Total purchases attributed to these ads" },
    { name: "otherCosts",    label: "Other Variable Costs",   type: "currency", defaultValue: 50,    min: 0, helpText: "Shipping, packaging, returns, etc." },
  ],
  outputs: [
    { key: "roas",              label: "ROAS",                 format: "multiplier", highlight: true, description: "Return on Ad Spend (Revenue ÷ Ad Spend)" },
    { key: "netProfit",         label: "Net Profit",           format: "currency",   highlight: true },
    { key: "netProfitMargin",   label: "Net Profit Margin %",  format: "percent",    highlight: true },
    { key: "cpa",               label: "Cost Per Acquisition", format: "currency",   description: "Ad Spend ÷ Conversions" },
    { key: "breakEvenRoas",     label: "Break-Even ROAS",      format: "multiplier", description: "Minimum ROAS to avoid losing money" },
    { key: "revenuePerConv",    label: "Revenue Per Conversion", format: "currency" },
    { key: "totalCosts",        label: "Total Costs",          format: "currency" },
    { key: "roi",               label: "ROI %",                format: "percent" },
  ],
  chartKeys: ["adSpend", "cogs", "platformFees", "otherCosts", "netProfit"],
  compute(v) {
    const totalCosts = v.adSpend + v.cogs + v.platformFees + v.otherCosts;
    const netProfit = v.revenue - totalCosts;
    const roas = v.adSpend > 0 ? v.revenue / v.adSpend : 0;
    const netProfitMargin = v.revenue > 0 ? (netProfit / v.revenue) * 100 : 0;
    const cpa = v.conversions > 0 ? v.adSpend / v.conversions : 0;
    const nonAdCosts = v.cogs + v.platformFees + v.otherCosts;
    const breakEvenRoas = v.adSpend > 0 ? (v.adSpend + nonAdCosts) / v.adSpend : 0;
    const revenuePerConv = v.conversions > 0 ? v.revenue / v.conversions : 0;
    const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;
    return { roas, netProfit, netProfitMargin, cpa, breakEvenRoas, revenuePerConv, totalCosts, roi, adSpend: v.adSpend, cogs: v.cogs, platformFees: v.platformFees, otherCosts: v.otherCosts };
  },
  seoContent: {
    intro: `ROAS (Return on Ad Spend) tells you how many dollars of revenue you earn for every dollar spent on Meta Ads. But ROAS alone doesn't tell you if you're actually profitable — a 3x ROAS campaign can still lose money once you factor in product costs, platform fees, and shipping. This Meta Ads ROAS & Profit Calculator goes beyond vanity metrics and shows you your real net profit after every cost.`,
    howToSteps: [
      "Enter your **total ad spend** — the amount you spent on Facebook and Instagram ads in the period.",
      "Enter **revenue generated** — the total sales revenue you can attribute to these campaigns.",
      "Add your **COGS** (cost of goods sold) — the total product cost for all units sold from these ads.",
      "Add **platform fees** — payment processing, Shopify/WooCommerce fees, etc.",
      "Enter the **number of conversions** (purchases) to calculate your cost per acquisition.",
      "Add any **other variable costs** like shipping, packaging, and returns.",
      "Your ROAS, net profit, CPA, and break-even ROAS appear instantly.",
    ],
    formula: `ROAS = Revenue ÷ Ad Spend\n\nNet Profit = Revenue − Ad Spend − COGS − Platform Fees − Other Costs\n\nBreak-Even ROAS = (Ad Spend + All Non-Ad Costs) ÷ Ad Spend\n\nCPA = Ad Spend ÷ Number of Conversions`,
    workedExample: `Ad spend: $500. Revenue: $2,000. COGS: $600. Fees: $60. Other costs: $50.\n\nROAS = $2,000 ÷ $500 = 4.0x\nTotal Costs = $500 + $600 + $60 + $50 = $1,210\nNet Profit = $2,000 − $1,210 = $790\nNet Margin = ($790 ÷ $2,000) × 100 = 39.5%\nCPA = $500 ÷ 40 conversions = $12.50\nBreak-Even ROAS = $1,210 ÷ $500 = 2.42x`,
    faqs: [
      { q: "What is a good ROAS for Facebook Ads?", a: "A 'good' ROAS depends on your margins. Most ecommerce businesses target 3–5x ROAS, but a low-margin product might need 8–10x to be profitable. Use this calculator to find your personal break-even ROAS, then target meaningfully above it." },
      { q: "What is break-even ROAS?", a: "Break-even ROAS is the minimum revenue-to-ad-spend ratio at which you make zero profit. If your break-even ROAS is 2.5x, any campaign below that is losing money. Calculate it as: (Ad Spend + All Other Costs) ÷ Ad Spend." },
      { q: "Why can I have a high ROAS but still lose money?", a: "ROAS only measures revenue vs. ad spend. It ignores your product cost, shipping, and fees. A 4x ROAS sounds great, but if your product margin is only 20%, your break-even ROAS might be 5x. Always calculate net profit, not just ROAS." },
      { q: "What is CPA in Meta Ads?", a: "CPA (Cost Per Acquisition) is how much you spend on ads to acquire one customer. CPA = Ad Spend ÷ Number of Purchases. A profitable CPA is one that's significantly lower than your average order value multiplied by your net margin." },
      { q: "How do I improve my Meta Ads ROAS?", a: "Improve ROAS by targeting warm audiences (retargeting, lookalikes), improving your ad creative and landing page conversion rate, cutting underperforming ad sets, and increasing your average order value through bundles or upsells." },
    ],
  },
};

export default config;
