import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "saas-pricing-margin",
  title: "SaaS Pricing & Margin Calculator",
  shortTitle: "SaaS Pricing Margin",
  description: "Calculate your SaaS gross margin per customer after hosting, support, and payment processing costs.",
  metaDescription: "Free SaaS pricing calculator. Enter your subscription price, hosting cost, support cost, and payment fees to calculate gross margin per customer and per month.",
  keywords: ["saas pricing calculator", "saas gross margin calculator", "software pricing calculator", "saas cost of goods sold calculator"],
  icon: "🏷️",
  category: "saas",
  relatedSlugs: ["ltv-cac", "saas-mrr", "break-even-point"],
  fields: [
    { name: "monthlyPrice",     label: "Monthly Subscription Price", type: "currency", defaultValue: 79,  min: 0 },
    { name: "hostingCostPerUser", label: "Hosting / Infra Cost per User", type: "currency", defaultValue: 6, min: 0 },
    { name: "supportCostPerUser", label: "Support Cost per User",   type: "currency", defaultValue: 4,   min: 0 },
    { name: "paymentFeePct",    label: "Payment Processing Fee %", type: "percent",  defaultValue: 2.9,  min: 0, max: 10 },
    { name: "paymentFeeFixed",  label: "Payment Processing Fixed Fee", type: "currency", defaultValue: 0.30, min: 0 },
    { name: "thirdPartyToolsPerUser", label: "Third-Party Tools per User", type: "currency", defaultValue: 2, min: 0, helpText: "Analytics, email, customer support tools, etc." },
    { name: "customerCount",    label: "Total Customers",          type: "number",   defaultValue: 500,  min: 0 },
  ],
  outputs: [
    { key: "totalCogsPerUser",  label: "Total COGS per User",      format: "currency" },
    { key: "grossMarginPerUser",label: "Gross Margin per User",    format: "currency", highlight: true },
    { key: "grossMarginPct",    label: "Gross Margin %",           format: "percent",  highlight: true },
    { key: "totalMonthlyRevenue", label: "Total Monthly Revenue",  format: "currency" },
    { key: "totalMonthlyGrossProfit", label: "Total Monthly Gross Profit", format: "currency", highlight: true },
  ],
  chartKeys: ["hostingCostPerUser", "supportCostPerUser", "thirdPartyToolsPerUser", "grossMarginPerUser"],
  compute(v) {
    const paymentFeeAmt = (v.monthlyPrice * v.paymentFeePct) / 100 + v.paymentFeeFixed;
    const totalCogsPerUser = v.hostingCostPerUser + v.supportCostPerUser + v.thirdPartyToolsPerUser + paymentFeeAmt;
    const grossMarginPerUser = v.monthlyPrice - totalCogsPerUser;
    const grossMarginPct = v.monthlyPrice > 0 ? (grossMarginPerUser / v.monthlyPrice) * 100 : 0;
    const totalMonthlyRevenue = v.monthlyPrice * v.customerCount;
    const totalMonthlyGrossProfit = grossMarginPerUser * v.customerCount;
    return { totalCogsPerUser, grossMarginPerUser, grossMarginPct, totalMonthlyRevenue, totalMonthlyGrossProfit };
  },
  seoContent: {
    intro: `SaaS gross margin looks great on a pitch deck at "80%+" — but that number depends entirely on what you count as cost of goods sold. Hosting, support time, third-party tooling, and payment processing fees all scale with your customer count and eat directly into margin. This calculator gives you an honest per-customer and company-wide gross margin.`,
    howToSteps: [
      "Enter your **monthly subscription price**.",
      "Enter **hosting/infrastructure cost per user** — servers, storage, bandwidth.",
      "Enter **support cost per user** — allocate support team cost across your customer base.",
      "Add your **payment processing fee %** and **fixed fee** (e.g. Stripe's 2.9% + $0.30).",
      "Add any **third-party tool costs per user** — analytics, email, in-app chat, etc.",
      "Enter your **total customer count** to see company-wide gross profit.",
    ],
    formula: `Payment Fee = (Price × Fee %) + Fixed Fee\n\nTotal COGS per User = Hosting + Support + Third-Party Tools + Payment Fee\n\nGross Margin per User = Price − Total COGS per User\n\nGross Margin % = (Gross Margin per User ÷ Price) × 100`,
    workedExample: `Price: $79/mo. Hosting: $6. Support: $4. Tools: $2. Payment fee: 2.9% + $0.30 = $2.59. Customers: 500.\n\nTotal COGS per User = $6 + $4 + $2 + $2.59 = $14.59\nGross Margin per User = $79 − $14.59 = $64.41\nGross Margin % = $64.41 ÷ $79 = 81.5%\nTotal Monthly Gross Profit = $64.41 × 500 = $32,205`,
    faqs: [
      { q: "What is a good gross margin for SaaS?", a: "Best-in-class SaaS companies typically run 75–85%+ gross margin. Below 70% is often a signal that infrastructure, support, or third-party costs are eating too much into unit economics relative to typical software benchmarks." },
      { q: "What should I include in SaaS COGS?", a: "Hosting/infrastructure, customer support directly tied to serving customers, payment processing fees, and any third-party services required to deliver the product (not sales, marketing, or general engineering/R&D, which are operating expenses, not COGS)." },
      { q: "Should engineering salaries be in COGS or opex?", a: "Convention varies, but most SaaS companies treat engineers building new features as opex (R&D) and only allocate a portion of DevOps/infrastructure-focused engineering time to COGS, since that work directly supports delivering the service to existing customers." },
      { q: "How does customer support cost scale with growth?", a: "Support cost per user often decreases as you scale (self-serve docs, better onboarding, automation), but can spike if you add complex features or move upmarket to customers who need more hands-on support — track it as a per-user metric to catch drift early." },
      { q: "Does gross margin affect how much I can spend on acquiring customers?", a: "Yes directly — LTV calculations use gross margin, not raw revenue, so a lower gross margin means a lower sustainable CAC even at the same subscription price." },
    ],
  },
};

export default config;