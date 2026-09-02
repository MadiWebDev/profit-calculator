import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "amazon-fba-profit",
  title: "Amazon FBA Profit Calculator",
  shortTitle: "Amazon FBA",
  description: "Calculate Amazon FBA net profit, margin, and break-even ROAS after FBA fees, referral fees, and PPC.",
  metaDescription: "Free Amazon FBA profit calculator. Enter product cost, FBA fees, referral fee %, PPC spend, and selling price to calculate net margin, break-even ROAS, and ROI.",
  keywords: ["amazon fba profit calculator", "amazon fba calculator", "amazon seller profit calculator", "fba fee calculator", "amazon roi calculator"],
  icon: "📬",
  category: "ecommerce",
  relatedSlugs: ["shopify-profit", "dropshipping-profit", "google-ads-roi"],
  fields: [
    { name: "sellingPrice",   label: "Selling Price",           type: "currency", defaultValue: 34.99, min: 0 },
    { name: "productCost",    label: "Product Cost (COGS)",     type: "currency", defaultValue: 8.00,  min: 0 },
    { name: "fbaFee",         label: "FBA Fulfillment Fee",     type: "currency", defaultValue: 3.22,  min: 0, helpText: "Amazon's fee to pick, pack, and ship. Check Seller Central for exact amount." },
    { name: "referralFee",    label: "Referral Fee %",          type: "percent",  defaultValue: 15,    min: 0, max: 45, helpText: "Usually 8–15% depending on category. Most categories are 15%." },
    { name: "storageFee",     label: "Storage Fee (monthly)",   type: "currency", defaultValue: 0.50,  min: 0, helpText: "Monthly FBA storage fee allocated per unit" },
    { name: "ppcSpend",       label: "PPC Spend Per Unit",      type: "currency", defaultValue: 4.00,  min: 0, helpText: "Amazon Sponsored Products spend ÷ units sold" },
    { name: "otherCosts",     label: "Prep / Other Costs",      type: "currency", defaultValue: 0.50,  min: 0, helpText: "Prep center fees, shipping to Amazon, etc." },
    { name: "quantity",       label: "Units Sold",              type: "number",   defaultValue: 150,   min: 1 },
  ],
  outputs: [
    { key: "netProfitPerUnit",  label: "Net Profit Per Unit",   format: "currency", highlight: true },
    { key: "netMargin",         label: "Net Margin %",          format: "percent",  highlight: true },
    { key: "roi",               label: "ROI %",                 format: "percent",  highlight: true },
    { key: "totalRevenue",      label: "Total Revenue",         format: "currency" },
    { key: "totalProfit",       label: "Total Net Profit",      format: "currency" },
    { key: "breakEvenRoas",     label: "Break-Even ROAS",       format: "multiplier", description: "Min ROAS to cover all costs" },
    { key: "amazonFees",        label: "Total Amazon Fees",     format: "currency" },
    { key: "breakEvenPrice",    label: "Break-Even Price",      format: "currency" },
  ],
  chartKeys: ["productCost", "fbaFee", "referralFeeAmt", "ppcSpend", "netProfitPerUnit"],
  compute(v) {
    const referralFeeAmt = (v.sellingPrice * v.referralFee) / 100;
    const amazonFees = v.fbaFee + referralFeeAmt + v.storageFee;
    const totalCostPerUnit = v.productCost + amazonFees + v.ppcSpend + v.otherCosts;
    const netProfitPerUnit = v.sellingPrice - totalCostPerUnit;
    const netMargin = v.sellingPrice > 0 ? (netProfitPerUnit / v.sellingPrice) * 100 : 0;
    const roi = totalCostPerUnit > 0 ? (netProfitPerUnit / totalCostPerUnit) * 100 : 0;
    const totalRevenue = v.sellingPrice * v.quantity;
    const totalProfit = netProfitPerUnit * v.quantity;
    const breakEvenRoas = v.ppcSpend > 0 ? totalCostPerUnit / v.ppcSpend : 0;
    const breakEvenPrice = totalCostPerUnit;
    return { netProfitPerUnit, netMargin, roi, totalRevenue, totalProfit, breakEvenRoas, amazonFees, breakEvenPrice, productCost: v.productCost, fbaFee: v.fbaFee, referralFeeAmt, ppcSpend: v.ppcSpend };
  },
  seoContent: {
    intro: `Amazon FBA can be incredibly lucrative — but the fee structure is also notoriously complex. Between referral fees (8–15%+), FBA fulfillment fees, monthly storage fees, and PPC advertising, your real profit per unit can be dramatically different from your gross margin. This Amazon FBA Profit Calculator accounts for every fee Amazon charges and shows you your true net margin and ROI before you invest in inventory.`,
    howToSteps: [
      "Enter your **selling price** — your listing price on Amazon.",
      "Enter your **product cost (COGS)** — what you pay your supplier, including inbound shipping to Amazon.",
      "Add the **FBA fulfillment fee** — find this in Amazon's FBA Revenue Calculator or Seller Central based on product dimensions and weight.",
      "Set the **referral fee %** — typically 15% for most categories (8% for electronics, up to 45% for some accessories).",
      "Add any **monthly storage fees** allocated per unit.",
      "Enter your **PPC spend per unit** — Amazon Sponsored Products spend ÷ units sold.",
      "Add prep center, labeling, or other per-unit costs.",
      "Review net margin, ROI, break-even ROAS, and total profit.",
    ],
    formula: `Net Profit = Selling Price − Product Cost − FBA Fee − Referral Fee − Storage Fee − PPC Per Unit − Other Costs\n\nReferral Fee = Selling Price × Referral Fee %\n\nBreak-Even ROAS = Total Cost Per Unit ÷ PPC Spend Per Unit`,
    workedExample: `Selling price: $34.99. Product cost: $8. FBA fee: $3.22. Referral fee: 15% = $5.25. Storage: $0.50. PPC per unit: $4.\n\nTotal Costs = $8 + $3.22 + $5.25 + $0.50 + $4 = $20.97\nNet Profit = $34.99 − $20.97 = $14.02\nNet Margin = ($14.02 ÷ $34.99) × 100 = 40.1%\nROI = ($14.02 ÷ $20.97) × 100 = 66.9%`,
    faqs: [
      { q: "What are typical Amazon FBA fees?", a: "FBA fees consist of fulfillment fees (size/weight-based, roughly $3–$7 for standard items), referral fees (8–15% of selling price depending on category), and storage fees ($0.75–$2.40/cubic foot/month depending on season)." },
      { q: "What is a good profit margin for Amazon FBA?", a: "A net margin of 20–30%+ is healthy for Amazon FBA. Many successful sellers target 30–50% margins to buffer against fee increases, storage costs, and PPC competition. Margins below 15% leave little room for error." },
      { q: "How do I find my FBA fulfillment fee?", a: "Use Amazon's FBA Revenue Calculator (available free in Seller Central) or the FBA Fee Preview report. Fees are based on your product's weight and dimensions in its shipping packaging." },
      { q: "Should I include PPC in my FBA profit calculation?", a: "Yes — PPC is a real cost of selling on Amazon. Divide your total monthly Sponsored Products spend by units sold in that period to get your PPC cost per unit. Many sellers forget this and overestimate their true margin." },
      { q: "What is break-even ROAS for Amazon PPC?", a: "Amazon PPC break-even ROAS = Total Cost Per Unit (excluding PPC) ÷ Selling Price. It tells you the minimum revenue your ads must generate per dollar spent to avoid losing money on PPC-driven sales." },
    ],
  },
};

export default config;
