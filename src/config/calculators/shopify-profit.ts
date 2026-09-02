import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "shopify-profit",
  title: "Shopify Profit Calculator",
  shortTitle: "Shopify Profit",
  description: "Calculate your real net profit from Shopify sales after fees, shipping, and ad spend.",
  metaDescription: "Free Shopify profit calculator. Enter your product cost, selling price, Shopify fees, shipping, and ad spend to instantly see net profit, margin %, ROI, and break-even units.",
  keywords: ["shopify profit calculator", "shopify margin calculator", "ecommerce profit calculator", "shopify fee calculator", "shopify roi calculator"],
  icon: "🛍️",
  category: "ecommerce",
  relatedSlugs: ["dropshipping-profit", "meta-ads-roas", "profit-margin"],
  fields: [
    { name: "sellingPrice",   label: "Selling Price",            type: "currency", defaultValue: 49.99,  min: 0, helpText: "The price your customer pays" },
    { name: "productCost",    label: "Product / COGS Cost",      type: "currency", defaultValue: 12.00,  min: 0, helpText: "Your cost to source or manufacture one unit" },
    { name: "shippingCost",   label: "Shipping Cost (per order)",type: "currency", defaultValue: 4.50,   min: 0 },
    { name: "shopifyFee",     label: "Shopify Transaction Fee %", type: "percent",  defaultValue: 2.0,    min: 0, max: 10, helpText: "Shopify charges 0.5–2% unless you use Shopify Payments" },
    { name: "gatewayFee",     label: "Payment Gateway Fee %",    type: "percent",  defaultValue: 2.9,    min: 0, max: 10, helpText: "e.g. Stripe / PayPal — typically 2.9% + $0.30" },
    { name: "gatewayFixed",   label: "Gateway Fixed Fee ($)",    type: "currency", defaultValue: 0.30,   min: 0 },
    { name: "adSpendPerUnit", label: "Ad Spend per Unit Sold",   type: "currency", defaultValue: 8.00,   min: 0, helpText: "Total ad spend ÷ units sold" },
    { name: "quantity",       label: "Units Sold",               type: "number",   defaultValue: 100,    min: 1, helpText: "Used to project total profit" },
  ],
  outputs: [
    { key: "netProfitPerUnit",  label: "Net Profit / Unit",   format: "currency", highlight: true },
    { key: "profitMargin",      label: "Profit Margin %",      format: "percent",  highlight: true },
    { key: "roi",               label: "ROI %",                format: "percent",  highlight: true },
    { key: "totalRevenue",      label: "Total Revenue",        format: "currency" },
    { key: "totalProfit",       label: "Total Net Profit",     format: "currency", highlight: true },
    { key: "totalFees",         label: "Total Fees",           format: "currency" },
    { key: "breakEvenUnits",    label: "Break-Even Units",     format: "number", description: "Units needed to cover fixed ad costs" },
    { key: "breakEvenPrice",    label: "Break-Even Price",     format: "currency", description: "Minimum selling price to break even" },
  ],
  chartKeys: ["productCost", "shippingCost", "totalFees", "adSpendPerUnit", "netProfitPerUnit"],
  compute(v) {
    const fees = (v.sellingPrice * (v.shopifyFee + v.gatewayFee)) / 100 + v.gatewayFixed;
    const totalCost = v.productCost + v.shippingCost + fees + v.adSpendPerUnit;
    const netProfitPerUnit = v.sellingPrice - totalCost;
    const profitMargin = v.sellingPrice > 0 ? (netProfitPerUnit / v.sellingPrice) * 100 : 0;
    const roi = totalCost > 0 ? (netProfitPerUnit / totalCost) * 100 : 0;
    const totalRevenue = v.sellingPrice * v.quantity;
    const totalProfit = netProfitPerUnit * v.quantity;
    const totalFees = fees * v.quantity;
    const fixedCostPerUnit = v.productCost + v.shippingCost + fees;
   const totalAdBudget = v.adSpendPerUnit * v.quantity;
const contributionMargin = v.sellingPrice - fixedCostPerUnit; // price minus cost+shipping+fees, before ad spend
const breakEvenUnits = contributionMargin > 0
  ? Math.ceil(totalAdBudget / contributionMargin)
  : 0;
    const breakEvenPrice = v.productCost + v.shippingCost + fees + v.adSpendPerUnit;
    return { netProfitPerUnit, profitMargin, roi, totalRevenue, totalProfit, totalFees, breakEvenUnits, breakEvenPrice, productCost: v.productCost, shippingCost: v.shippingCost, adSpendPerUnit: v.adSpendPerUnit };
  },
  seoContent: {
    intro: `Running a Shopify store is exciting — but do you actually know your real profit after Shopify fees, payment gateway charges, shipping, and advertising? Many sellers are surprised to discover their 50% markup translates to just 10–15% net margin once all costs are tallied. This Shopify profit calculator gives you total transparency. Enter your numbers and see your real margin in real time.`,
    howToSteps: [
      "Enter your **selling price** — the price customers pay on your store.",
      "Add your **product cost** (COGS) — what you pay your supplier, manufacturer, or print-on-demand service per unit.",
      "Enter your **shipping cost** — the actual cost to ship one order.",
      "Set your **Shopify transaction fee** — Basic plan charges 2%, Shopify plan 1%, Advanced 0.5%. If you use Shopify Payments, this is 0%.",
      "Set your **payment gateway fee** — Stripe and PayPal both charge around 2.9% + $0.30 per transaction.",
      "Enter your **ad spend per unit** — divide your total monthly ad spend by units sold to get this number.",
      "Set **units sold** to project total profit for the period.",
      "Read your net profit, margin %, ROI, and break-even point instantly.",
    ],
    formula: `Net Profit = Selling Price − Product Cost − Shipping − (Selling Price × Shopify Fee %) − (Selling Price × Gateway Fee %) − Gateway Fixed Fee − Ad Spend Per Unit\n\nProfit Margin % = (Net Profit ÷ Selling Price) × 100\n\nROI % = (Net Profit ÷ Total Cost) × 100`,
    workedExample: `Suppose you sell a product at $49.99. Your product costs $12, shipping is $4.50, Shopify fee is 2%, Stripe fee is 2.9% + $0.30, and you spend $8 on ads per unit sold.\n\nFees = ($49.99 × 4.9%) + $0.30 = $2.45 + $0.30 = $2.75\nTotal Cost = $12 + $4.50 + $2.75 + $8 = $27.25\nNet Profit = $49.99 − $27.25 = $22.74\nProfit Margin = ($22.74 ÷ $49.99) × 100 = 45.5%\nROI = ($22.74 ÷ $27.25) × 100 = 83.4%`,
    faqs: [
      { q: "What is a good profit margin for Shopify?", a: "A net margin of 15–30% is considered healthy for Shopify stores. Top-performing stores achieve 30–50%+ by focusing on high-margin products and keeping ad spend efficient. Anything below 10% is risky as a slight dip in conversions can push you into losses." },
      { q: "Does Shopify charge a transaction fee if I use Shopify Payments?", a: "No. If you use Shopify Payments as your payment processor, Shopify waives its transaction fee (0.5–2%). You still pay Shopify Payments' credit card rates (2.4–2.9% + $0.30 depending on your plan)." },
      { q: "How do I calculate break-even on Shopify?", a: "Break-even price = Product Cost + Shipping + All Fees + Ad Spend Per Unit. Any selling price above this number generates profit. Use the break-even units field to see how many sales cover your fixed costs." },
      { q: "Should I include ad spend in my Shopify profit calculation?", a: "Absolutely. Ad spend is often the #1 overlooked cost. Divide your total monthly ad spend (Facebook, Google, TikTok) by units sold to get your ad cost per unit, then include it in this calculator for an accurate profit figure." },
      { q: "What's the difference between gross margin and net margin on Shopify?", a: "Gross margin only subtracts COGS (product cost) from revenue. Net margin subtracts all costs — shipping, fees, ad spend, and overheads. Net margin is your true profitability number." },
    ],
  },
};

export default config;
