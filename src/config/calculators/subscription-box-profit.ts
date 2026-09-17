import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "subscription-box-profit",
  title: "Subscription Box Profit Calculator",
  shortTitle: "Subscription Box Profit",
  description: "Calculate your subscription box profit per box, per subscriber lifetime, and monthly total profit.",
  metaDescription: "Free subscription box profit calculator. Enter box price, product cost, shipping, packaging, and churn to calculate profit per box, subscriber LTV, and monthly profit.",
  keywords: ["subscription box profit calculator", "subscription box cost calculator", "subscription box margin calculator", "subscription box roi"],
  icon: "🎁",
  category: "saas",
  relatedSlugs: ["saas-churn-cost", "shopify-profit", "ltv-cac"],
  fields: [
    { name: "boxPrice",       label: "Box Price (per shipment)", type: "currency", defaultValue: 39,  min: 0 },
    { name: "productCost",    label: "Product Cost (per box)",   type: "currency", defaultValue: 14,  min: 0 },
    { name: "packagingCost",  label: "Packaging Cost",           type: "currency", defaultValue: 2.50,min: 0 },
    { name: "shippingCost",   label: "Shipping Cost",            type: "currency", defaultValue: 6,   min: 0 },
    { name: "paymentFeePct",  label: "Payment Processing Fee %", type: "percent",  defaultValue: 2.9,  min: 0, max: 10 },
    { name: "monthlyChurnRate", label: "Monthly Churn Rate %",   type: "percent",  defaultValue: 8,    min: 0.1, max: 100 },
    { name: "activeSubscribers", label: "Active Subscribers",    type: "number",   defaultValue: 800,  min: 0 },
    { name: "cac",            label: "Customer Acquisition Cost", type: "currency", defaultValue: 25,  min: 0 },
  ],
  outputs: [
    { key: "profitPerBox",       label: "Profit per Box",         format: "currency", highlight: true },
    { key: "monthlyProfit",      label: "Total Monthly Profit",   format: "currency", highlight: true },
    { key: "avgSubscriberLifespanMonths", label: "Avg. Subscriber Lifespan (months)", format: "number" },
    { key: "subscriberLtv",      label: "Subscriber LTV",         format: "currency", highlight: true },
    { key: "ltvMinusCac",        label: "LTV − CAC",              format: "currency", highlight: true },
    { key: "paymentFeeAmt",      label: "Payment Fee per Box",    format: "currency" },
  ],
  chartKeys: ["productCost", "packagingCost", "shippingCost", "profitPerBox"],
  compute(v) {
    const paymentFeeAmt = (v.boxPrice * v.paymentFeePct) / 100;
    const totalCostPerBox = v.productCost + v.packagingCost + v.shippingCost + paymentFeeAmt;
    const profitPerBox = v.boxPrice - totalCostPerBox;
    const monthlyProfit = profitPerBox * v.activeSubscribers;
    const avgSubscriberLifespanMonths = v.monthlyChurnRate > 0 ? 1 / (v.monthlyChurnRate / 100) : 0;
    const subscriberLtv = profitPerBox * avgSubscriberLifespanMonths;
    const ltvMinusCac = subscriberLtv - v.cac;
    return { profitPerBox, monthlyProfit, avgSubscriberLifespanMonths, subscriberLtv, ltvMinusCac, paymentFeeAmt };
  },
  seoContent: {
    intro: `Subscription boxes live or die on retention — a profitable-looking first box means little if churn eats the customer before you recoup acquisition costs. This calculator shows your profit per box, then projects subscriber lifetime value based on your churn rate so you can see whether your CAC is actually sustainable.`,
    howToSteps: [
      "Enter your **box price** charged per shipment.",
      "Enter **product cost**, **packaging cost**, and **shipping cost** per box.",
      "Add your **payment processing fee %**.",
      "Enter your **monthly churn rate** to estimate average subscriber lifespan.",
      "Enter your **active subscriber count** for total monthly profit.",
      "Add your **customer acquisition cost (CAC)** to see LTV minus CAC.",
    ],
    formula: `Profit per Box = Box Price − Product Cost − Packaging − Shipping − Payment Fee\n\nAvg. Lifespan = 1 ÷ Monthly Churn Rate\n\nSubscriber LTV = Profit per Box × Avg. Lifespan`,
    workedExample: `Box price: $39. Product: $14. Packaging: $2.50. Shipping: $6. Payment fee: 2.9% = $1.13. Churn: 8%/mo. CAC: $25.\n\nTotal Cost = $14 + $2.50 + $6 + $1.13 = $23.63\nProfit per Box = $39 − $23.63 = $15.37\nAvg. Lifespan = 1 ÷ 8% = 12.5 months\nSubscriber LTV = $15.37 × 12.5 = $192.13\nLTV − CAC = $192.13 − $25 = $167.13`,
    faqs: [
      { q: "What's a normal churn rate for subscription boxes?", a: "Subscription box churn tends to run higher than typical SaaS — 5–10% monthly is common, though it varies widely by niche, box price point, and how well the box maintains novelty over time." },
      { q: "How does shipping cost impact subscription box margins?", a: "Shipping is often the single largest hidden cost, especially for heavier or bulkier boxes — negotiating carrier rates, using regional carriers, or adjusting box size/weight can meaningfully improve margin." },
      { q: "Should I include packaging design costs in COGS?", a: "Branded packaging (boxes, inserts, tissue paper) should be included as a per-unit cost since it recurs with every shipment, unlike a one-time design fee which is better treated as a separate upfront cost." },
      { q: "How do I calculate subscriber LTV for a box business?", a: "Multiply your profit per box by the average number of boxes a subscriber receives before churning (1 ÷ monthly churn rate), which accounts for the recurring nature of the revenue." },
      { q: "What LTV:CAC ratio should a subscription box business target?", a: "The same general 3:1 benchmark used across subscription businesses applies well here — if LTV isn't at least 3x your CAC, you likely don't have enough margin to profitably scale paid acquisition." },
    ],
  },
};

export default config;