import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "retail-markup",
  title: "Retail Markup Calculator",
  shortTitle: "Retail Markup",
  description: "Calculate retail markup %, margin %, and selling price from your wholesale or landed cost.",
  metaDescription: "Free retail markup calculator. Enter cost price and markup % or margin % to calculate selling price, gross profit, and keystone pricing.",
  keywords: ["retail markup calculator", "markup calculator", "keystone pricing calculator", "retail pricing calculator", "margin vs markup calculator"],
  icon: "🏷️",
  category: "retail",
  relatedSlugs: ["profit-margin", "wholesale-profit", "shopify-profit"],
  fields: [
    { name: "costPrice",      label: "Cost Price (per unit)",   type: "currency", defaultValue: 12,  min: 0 },
    { name: "targetMarkupPct",label: "Target Markup %",         type: "percent",  defaultValue: 100,  min: 0, max: 1000, helpText: "100% markup = keystone pricing (2x cost)" },
    { name: "salesTaxPct",    label: "Sales Tax % (if included in price)", type: "percent", defaultValue: 0, min: 0, max: 20 },
    { name: "unitsSold",      label: "Units Sold (monthly)",    type: "number",   defaultValue: 200,  min: 0 },
  ],
  outputs: [
    { key: "sellingPrice",     label: "Selling Price",         format: "currency", highlight: true },
    { key: "grossProfitPerUnit", label: "Gross Profit per Unit", format: "currency", highlight: true },
    { key: "marginPct",        label: "Margin %",              format: "percent",  highlight: true, description: "Profit as % of selling price" },
    { key: "markupPct",        label: "Markup %",              format: "percent",  description: "Profit as % of cost" },
    { key: "monthlyGrossProfit", label: "Monthly Gross Profit", format: "currency", highlight: true },
    { key: "monthlyRevenue",   label: "Monthly Revenue",       format: "currency" },
  ],
  chartKeys: ["costPrice", "grossProfitPerUnit"],
  compute(v) {
    const sellingPriceBeforeTax = v.costPrice * (1 + v.targetMarkupPct / 100);
    const sellingPrice = sellingPriceBeforeTax * (1 + v.salesTaxPct / 100);
    const grossProfitPerUnit = sellingPriceBeforeTax - v.costPrice;
    const marginPct = sellingPriceBeforeTax > 0 ? (grossProfitPerUnit / sellingPriceBeforeTax) * 100 : 0;
    const markupPct = v.targetMarkupPct;
    const monthlyGrossProfit = grossProfitPerUnit * v.unitsSold;
    const monthlyRevenue = sellingPriceBeforeTax * v.unitsSold;
    return { sellingPrice, grossProfitPerUnit, marginPct, markupPct, monthlyGrossProfit, monthlyRevenue };
  },
  seoContent: {
    intro: `Markup and margin are calculated from the same numbers but express profit differently — markup is profit as a percentage of cost, margin is profit as a percentage of price — and mixing them up leads to real pricing mistakes. This calculator converts your target markup into a selling price and shows both numbers side by side.`,
    howToSteps: [
      "Enter your **cost price** per unit (wholesale or landed cost).",
      "Enter your **target markup %** — 100% is the classic 'keystone' retail markup, doubling cost.",
      "Add **sales tax %** if you want the tax-inclusive shelf price.",
      "Enter **units sold per month** to project total gross profit.",
      "Review selling price, gross profit per unit, and both margin % and markup %.",
    ],
    formula: `Selling Price = Cost Price × (1 + Markup %)\n\nGross Profit = Selling Price − Cost Price\n\nMargin % = (Gross Profit ÷ Selling Price) × 100\n\nMarkup % = (Gross Profit ÷ Cost Price) × 100`,
    workedExample: `Cost: $12. Markup: 100% (keystone). Units sold: 200/mo.\n\nSelling Price = $12 × (1 + 100%) = $24\nGross Profit per Unit = $24 − $12 = $12\nMargin % = $12 ÷ $24 = 50%\nMarkup % = $12 ÷ $12 = 100%\nMonthly Gross Profit = $12 × 200 = $2,400`,
    faqs: [
      { q: "What's the difference between markup and margin?", a: "Markup is profit expressed as a percentage of cost: (Profit ÷ Cost) × 100. Margin is profit expressed as a percentage of selling price: (Profit ÷ Price) × 100. A 100% markup always equals exactly a 50% margin — they describe the same profit differently." },
      { q: "What is keystone pricing?", a: "Keystone pricing means doubling your cost to set the retail price — a 100% markup, or 50% margin. It's a simple, widely used starting point in retail, though not always optimal for every category or price point." },
      { q: "Should every product have the same markup?", a: "No — retailers commonly vary markup by category based on price sensitivity, competition, and perceived value. Staples might carry a lower markup to stay competitive, while unique or high-demand items can support a much higher markup." },
      { q: "How do I convert a target margin % into a markup %?", a: "Markup % = Margin % ÷ (1 − Margin %). For example, a 40% target margin requires a markup of 40% ÷ 60% ≈ 66.7%." },
      { q: "Does markup account for other selling costs?", a: "Not directly — this calculator computes gross profit only. Shipping, payment processing, platform fees, and returns should be subtracted separately to find your true net profit margin, similar to the Shopify or profit margin calculators." },
    ],
  },
};

export default config;