import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "dropshipping-profit",
  title: "Dropshipping Profit Calculator",
  shortTitle: "Dropshipping Profit",
  description: "Calculate dropshipping profit per order and monthly profit projections with a volume slider.",
  metaDescription: "Free dropshipping profit calculator. Enter supplier cost, selling price, shipping, ads, and platform fees to see profit per order, monthly profit projection, and ROI %.",
  keywords: ["dropshipping profit calculator", "dropshipping margin calculator", "dropshipping roi calculator", "aliexpress profit calculator", "dropshipping calculator"],
  icon: "📦",
  category: "ecommerce",
  relatedSlugs: ["shopify-profit", "meta-ads-roas", "amazon-fba-profit"],
  fields: [
    { name: "sellingPrice",   label: "Selling Price",            type: "currency", defaultValue: 39.99, min: 0 },
    { name: "supplierCost",   label: "Supplier / Product Cost",  type: "currency", defaultValue: 8.00,  min: 0, helpText: "What you pay AliExpress / supplier per unit" },
    { name: "shippingCost",   label: "Shipping Cost (to customer)", type: "currency", defaultValue: 3.50, min: 0 },
    { name: "adSpendPerUnit", label: "Ad Spend per Unit Sold",   type: "currency", defaultValue: 7.00,  min: 0, helpText: "Total ad spend ÷ units sold this period" },
    { name: "platformFee",    label: "Platform Fee %",           type: "percent",  defaultValue: 2.9,   min: 0, max: 20, helpText: "Shopify / WooCommerce / Etsy fee %" },
    { name: "platformFixed",  label: "Platform Fixed Fee ($)",   type: "currency", defaultValue: 0.30,  min: 0 },
    { name: "monthlyOrders",  label: "Monthly Order Volume",     type: "number",   defaultValue: 200,   min: 1, helpText: "Projected orders per month for profit projection" },
    { name: "refundRate",     label: "Refund / Return Rate %",   type: "percent",  defaultValue: 3,     min: 0, max: 100, helpText: "% of orders that are refunded" },
  ],
  outputs: [
    { key: "profitPerOrder",     label: "Profit Per Order",       format: "currency", highlight: true },
    { key: "profitMargin",       label: "Profit Margin %",        format: "percent",  highlight: true },
    { key: "monthlyProfit",      label: "Monthly Profit",         format: "currency", highlight: true },
    { key: "monthlyRevenue",     label: "Monthly Revenue",        format: "currency" },
    { key: "roi",                label: "ROI %",                  format: "percent" },
    { key: "breakEvenPrice",     label: "Break-Even Price",       format: "currency", description: "Minimum price to break even" },
    { key: "annualProfit",       label: "Annual Profit (projected)", format: "currency" },
    { key: "effectiveCost",      label: "Total Cost Per Order",   format: "currency" },
  ],
  chartKeys: ["supplierCost", "shippingCost", "adSpendPerUnit", "platformFee", "profitPerOrder"],
  compute(v) {
    const platformFeeAmt = (v.sellingPrice * v.platformFee) / 100 + v.platformFixed;
    const effectiveCost = v.supplierCost + v.shippingCost + v.adSpendPerUnit + platformFeeAmt;
    const refundCostPerOrder = (v.refundRate / 100) * v.sellingPrice;
    const profitPerOrder = v.sellingPrice - effectiveCost - refundCostPerOrder;
    const profitMargin = v.sellingPrice > 0 ? (profitPerOrder / v.sellingPrice) * 100 : 0;
   const totalCostPerOrder = effectiveCost + refundCostPerOrder;
const roi = totalCostPerOrder > 0 ? (profitPerOrder / totalCostPerOrder) * 100 : 0;
    const monthlyRevenue = v.sellingPrice * v.monthlyOrders;
    const monthlyProfit = profitPerOrder * v.monthlyOrders;
    const annualProfit = monthlyProfit * 12;
    const breakEvenPrice = effectiveCost / (1 - v.refundRate / 100);
    return {
      profitPerOrder, profitMargin, monthlyProfit, monthlyRevenue, roi,
      breakEvenPrice, annualProfit, effectiveCost,
      supplierCost: v.supplierCost, shippingCost: v.shippingCost,
      adSpendPerUnit: v.adSpendPerUnit, platformFee: platformFeeAmt,
    };
  },
  seoContent: {
    intro: `Dropshipping looks attractive on the surface — no inventory, no upfront stock costs. But the real money is in the margins, and those margins get squeezed quickly by supplier costs, shipping, platform fees, and advertising. This dropshipping profit calculator shows you exactly how much you make per order, your monthly profit projection, and the minimum price you need to charge to break even. No more guessing — know your numbers before you run a single ad.`,
    howToSteps: [
      "Enter your **selling price** — what customers pay on your store.",
      "Enter your **supplier cost** — what you pay AliExpress, CJ Dropshipping, or your supplier.",
      "Add the **shipping cost** you pay to deliver the product to your customer.",
      "Enter your **ad spend per unit** — divide monthly ad spend by monthly orders.",
      "Set your **platform fee %** — Shopify Basic with Stripe charges ~2.9% + $0.30.",
      "Enter your **monthly order volume** to see monthly and annual profit projections.",
      "Set your **refund/return rate** to account for realistic losses from returns.",
    ],
    formula: `Profit Per Order = Selling Price − Supplier Cost − Shipping − Ad Spend Per Unit − Platform Fees − (Selling Price × Refund Rate %)\n\nMonthly Profit = Profit Per Order × Monthly Orders\n\nBreak-Even Price = Total Cost Per Order ÷ (1 − Refund Rate %)`,
    workedExample: `Selling price: $39.99. Supplier: $8. Shipping: $3.50. Ads per unit: $7. Platform fee: 2.9% + $0.30 = $1.46. Refund rate: 3%.\n\nTotal Cost = $8 + $3.50 + $7 + $1.46 = $19.96\nRefund cost = $39.99 × 3% = $1.20\nProfit Per Order = $39.99 − $19.96 − $1.20 = $18.83\nMargin = $18.83 ÷ $39.99 = 47.1%\nMonthly Profit (200 orders) = $18.83 × 200 = $3,766`,
    faqs: [
      { q: "Is dropshipping still profitable in 2025?", a: "Yes, dropshipping remains profitable for sellers who choose high-margin niches, invest in brand building, and manage ad costs tightly. The market is competitive, but businesses with 30%+ net margins and strong ad efficiency consistently succeed." },
      { q: "What profit margin should I target for dropshipping?", a: "Aim for at least 20–30% net profit margin for a sustainable dropshipping business. Below 15%, a small dip in ad performance or an increase in supplier costs can wipe out all profit. High-ticket dropshipping (products above $100) often achieves 30–50% margins." },
      { q: "How do I calculate dropshipping profit?", a: "Dropshipping Profit = Selling Price − Supplier Cost − Shipping − Ad Spend Per Unit − Platform Fees − Refund Costs. Every single cost must be included. The most common mistake is forgetting to include ad spend per unit sold." },
      { q: "What platform fees should I factor in for dropshipping?", a: "On Shopify + Stripe: 2.9% + $0.30 per transaction (plus 0.5–2% Shopify fee unless using Shopify Payments). On WooCommerce: hosting + Stripe fees. On Etsy: 6.5% listing + transaction fee. Always check your platform's current fee structure." },
      { q: "How much should I spend on ads per unit?", a: "A sustainable ad spend per unit is generally 20–30% of your selling price. If you're spending more than your gross margin on ads, you're losing money on every sale. Track your ad spend ÷ units sold daily and optimize aggressively." },
    ],
  },
};

export default config;
