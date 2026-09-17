import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "ltv-cac",
  title: "LTV:CAC Ratio Calculator",
  shortTitle: "LTV:CAC",
  description: "Calculate customer lifetime value, customer acquisition cost, and the LTV:CAC ratio that tells you if your growth is sustainable.",
  metaDescription: "Free LTV:CAC calculator. Enter ARPU, gross margin, churn rate, sales & marketing spend, and new customers to calculate LTV, CAC, LTV:CAC ratio, and payback period.",
  keywords: ["ltv cac calculator", "customer lifetime value calculator", "cac calculator", "ltv to cac ratio", "saas unit economics calculator"],
  icon: "⚖️",
  category: "saas",
  relatedSlugs: ["saas-mrr", "saas-churn-cost", "burn-rate-runway"],
  fields: [
    { name: "avgRevenuePerUser", label: "Avg. Revenue Per User / mo", type: "currency", defaultValue: 60, min: 0 },
    { name: "grossMarginPct",    label: "Gross Margin %",          type: "percent",  defaultValue: 80,   min: 0, max: 100 },
    { name: "monthlyChurnRate",  label: "Monthly Churn Rate %",    type: "percent",  defaultValue: 4,    min: 0.1, max: 100 },
    { name: "salesMarketingSpend", label: "Sales & Marketing Spend (period)", type: "currency", defaultValue: 15000, min: 0 },
    { name: "newCustomers",      label: "New Customers Acquired (same period)", type: "number", defaultValue: 50, min: 1 },
  ],
  outputs: [
    { key: "cac",              label: "Customer Acquisition Cost (CAC)", format: "currency", highlight: true },
    { key: "avgCustomerLifespanMonths", label: "Avg. Customer Lifespan (months)", format: "number" },
    { key: "ltv",              label: "Customer Lifetime Value (LTV)", format: "currency", highlight: true },
    { key: "ltvCacRatio",      label: "LTV : CAC Ratio",         format: "multiplier", highlight: true, description: "3:1 or higher is generally considered healthy" },
    { key: "cacPaybackMonths", label: "CAC Payback Period (months)", format: "number", highlight: true },
  ],
  chartKeys: ["cac", "ltv"],
  compute(v) {
    const cac = v.newCustomers > 0 ? v.salesMarketingSpend / v.newCustomers : 0;
    const avgCustomerLifespanMonths = v.monthlyChurnRate > 0 ? 1 / (v.monthlyChurnRate / 100) : 0;
    const grossMarginPerUser = v.avgRevenuePerUser * (v.grossMarginPct / 100);
    const ltv = grossMarginPerUser * avgCustomerLifespanMonths;
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;
    const cacPaybackMonths = grossMarginPerUser > 0 ? cac / grossMarginPerUser : 0;
    return { cac, avgCustomerLifespanMonths, ltv, ltvCacRatio, cacPaybackMonths };
  },
  seoContent: {
    intro: `LTV:CAC is the ratio investors and operators check first to judge whether a business can scale profitably — if you spend more acquiring customers than they're worth over their lifetime, growth just accelerates losses. This calculator computes both sides of the equation and the payback period that tells you how long that spend is tied up.`,
    howToSteps: [
      "Enter your **average revenue per user (ARPU)** per month.",
      "Enter your **gross margin %** — LTV should reflect margin, not raw revenue.",
      "Enter your **monthly churn rate** to estimate average customer lifespan.",
      "Enter total **sales & marketing spend** for a period and the **new customers** it generated.",
      "Review CAC, LTV, the LTV:CAC ratio, and CAC payback period.",
    ],
    formula: `CAC = Sales & Marketing Spend ÷ New Customers\n\nAvg. Customer Lifespan = 1 ÷ Monthly Churn Rate\n\nLTV = (ARPU × Gross Margin %) × Avg. Customer Lifespan\n\nLTV:CAC Ratio = LTV ÷ CAC\n\nCAC Payback (months) = CAC ÷ (ARPU × Gross Margin %)`,
    workedExample: `ARPU: $60/mo. Gross margin: 80%. Churn: 4%/mo. S&M spend: $15,000 for 50 new customers.\n\nCAC = $15,000 ÷ 50 = $300\nAvg. Lifespan = 1 ÷ 4% = 25 months\nGross Margin per User = $60 × 80% = $48/mo\nLTV = $48 × 25 = $1,200\nLTV:CAC Ratio = $1,200 ÷ $300 = 4.0x\nCAC Payback = $300 ÷ $48 = 6.25 months`,
    faqs: [
      { q: "What is a good LTV:CAC ratio?", a: "A ratio of 3:1 or higher is the widely cited healthy benchmark — meaning each customer is worth roughly 3x what it costs to acquire them. Below 1:1 means you're losing money on every customer; above 5:1 can sometimes suggest under-investing in growth." },
      { q: "Why use gross margin instead of raw revenue for LTV?", a: "LTV should represent the actual profit a customer contributes, not just top-line revenue — using gross margin ensures the cost of serving that customer (hosting, support, etc.) is already netted out." },
      { q: "What is CAC payback period and why does it matter?", a: "CAC payback is how many months it takes to earn back what you spent acquiring a customer, based on their margin contribution. Shorter payback periods (under 12 months for SaaS) mean less cash is tied up and less risk if the customer churns early." },
      { q: "What should I include in CAC?", a: "All fully-loaded costs of acquiring customers: ad spend, sales team salaries and commissions, marketing tooling, and content/creative production — not just ad spend alone, or CAC will be understated." },
      { q: "How do I improve my LTV:CAC ratio?", a: "Improve LTV by reducing churn and increasing ARPU (upsells, price increases); improve CAC by increasing conversion rates, improving targeting, and leaning into your highest-ROI acquisition channels while cutting underperforming ones." },
    ],
  },
};

export default config;