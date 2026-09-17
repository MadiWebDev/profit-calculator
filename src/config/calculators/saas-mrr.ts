import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "saas-mrr",
  title: "SaaS MRR & Growth Calculator",
  shortTitle: "SaaS MRR",
  description: "Calculate Monthly Recurring Revenue, net new MRR, and projected ARR from your subscriber metrics.",
  metaDescription: "Free SaaS MRR calculator. Enter subscribers, average price, churn, and new customers to calculate MRR, net new MRR, growth rate, and projected ARR.",
  keywords: ["mrr calculator", "saas mrr calculator", "monthly recurring revenue calculator", "arr calculator", "saas growth calculator"],
  icon: "📶",
  category: "saas",
  relatedSlugs: ["saas-churn-cost", "ltv-cac", "burn-rate-runway"],
  fields: [
    { name: "existingSubscribers", label: "Existing Subscribers",     type: "number",   defaultValue: 500,  min: 0 },
    { name: "avgMonthlyPrice",     label: "Average Price / Subscriber", type: "currency", defaultValue: 49, min: 0 },
    { name: "newSubscribers",      label: "New Subscribers This Month", type: "number", defaultValue: 60,  min: 0 },
    { name: "churnedSubscribers",  label: "Churned Subscribers This Month", type: "number", defaultValue: 25, min: 0 },
    { name: "expansionMrr",        label: "Expansion MRR (upgrades)", type: "currency", defaultValue: 800,  min: 0 },
    { name: "contractionMrr",      label: "Contraction MRR (downgrades)", type: "currency", defaultValue: 200, min: 0 },
  ],
  outputs: [
    { key: "currentMrr",       label: "Current MRR",         format: "currency", highlight: true },
    { key: "newMrr",           label: "New MRR (from new customers)", format: "currency" },
    { key: "churnedMrr",       label: "Churned MRR",         format: "currency" },
    { key: "netNewMrr",        label: "Net New MRR",         format: "currency", highlight: true },
    { key: "endingMrr",        label: "Ending MRR",          format: "currency", highlight: true },
    { key: "mrrGrowthRate",    label: "MRR Growth Rate %",   format: "percent",  highlight: true },
    { key: "projectedArr",     label: "Projected ARR",       format: "currency", highlight: true },
    { key: "churnRatePct",     label: "Subscriber Churn Rate %", format: "percent" },
  ],
  chartKeys: ["newMrr", "expansionMrr", "churnedMrr", "contractionMrr"],
  compute(v) {
    const currentMrr = v.existingSubscribers * v.avgMonthlyPrice;
    const newMrr = v.newSubscribers * v.avgMonthlyPrice;
    const churnedMrr = v.churnedSubscribers * v.avgMonthlyPrice;
    const netNewMrr = newMrr + v.expansionMrr - churnedMrr - v.contractionMrr;
    const endingMrr = currentMrr + netNewMrr;
    const mrrGrowthRate = currentMrr > 0 ? (netNewMrr / currentMrr) * 100 : 0;
    const projectedArr = endingMrr * 12;
    const churnRatePct = v.existingSubscribers > 0 ? (v.churnedSubscribers / v.existingSubscribers) * 100 : 0;
    return { currentMrr, newMrr, churnedMrr, netNewMrr, endingMrr, mrrGrowthRate, projectedArr, churnRatePct };
  },
  seoContent: {
    intro: `MRR is the single most important health metric in SaaS, but it's really made up of several moving parts: new business, expansion from upsells, and losses from churn and downgrades. This calculator breaks down your full MRR movement for the month and projects your annualized run rate (ARR).`,
    howToSteps: [
      "Enter your **existing subscriber count** and **average monthly price** per subscriber.",
      "Enter **new subscribers** gained this month.",
      "Enter **churned subscribers** lost this month.",
      "Add **expansion MRR** from upgrades and **contraction MRR** from downgrades.",
      "Review your net new MRR, ending MRR, growth rate, and projected ARR.",
    ],
    formula: `Net New MRR = New MRR + Expansion MRR − Churned MRR − Contraction MRR\n\nEnding MRR = Current MRR + Net New MRR\n\nMRR Growth Rate = (Net New MRR ÷ Current MRR) × 100\n\nARR = Ending MRR × 12`,
    workedExample: `Existing: 500 subs × $49 = $24,500 MRR. New: 60 subs × $49 = $2,940. Churned: 25 subs × $49 = $1,225. Expansion: $800. Contraction: $200.\n\nNet New MRR = $2,940 + $800 − $1,225 − $200 = $2,315\nEnding MRR = $24,500 + $2,315 = $26,815\nMRR Growth Rate = $2,315 ÷ $24,500 = 9.4%\nProjected ARR = $26,815 × 12 = $321,780`,
    faqs: [
      { q: "What's the difference between MRR and ARR?", a: "MRR (Monthly Recurring Revenue) is your predictable revenue per month; ARR (Annual Recurring Revenue) is simply MRR × 12, used for annual planning and often preferred when discussing larger, longer-term SaaS businesses." },
      { q: "What is a good MRR growth rate?", a: "Early-stage SaaS companies often target 10–20% month-over-month growth; more mature companies typically see 5–10% monthly or 40–100%+ annually. Benchmark against your stage and market rather than a single universal number." },
      { q: "What's the difference between churned MRR and contraction MRR?", a: "Churned MRR comes from customers who cancel entirely. Contraction MRR comes from existing customers who downgrade to a cheaper plan but don't fully cancel. Both reduce net new MRR but represent different customer behaviors worth tracking separately." },
      { q: "What is expansion MRR?", a: "Expansion MRR is additional recurring revenue from existing customers — upgrades, add-ons, or seat increases. Strong expansion MRR (sometimes called negative churn when it exceeds churn) is one of the best indicators of a healthy SaaS business." },
      { q: "How do I reduce churn's impact on MRR?", a: "Focus on onboarding quality, proactive customer success outreach for at-risk accounts, usage-based alerts, and building expansion revenue paths so upgrades can offset unavoidable churn." },
    ],
  },
};

export default config;
