import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "saas-churn-cost",
  title: "SaaS Churn Cost Calculator",
  shortTitle: "Churn Cost",
  description: "Calculate the true revenue impact of customer churn and how much reducing churn would be worth.",
  metaDescription: "Free SaaS churn cost calculator. Enter subscribers, churn rate, and average revenue per user to calculate lost MRR, lost ARR, and the value of reducing churn.",
  keywords: ["churn cost calculator", "saas churn calculator", "customer churn calculator", "revenue churn calculator", "churn rate impact calculator"],
  icon: "📉",
  category: "saas",
  relatedSlugs: ["saas-mrr", "ltv-cac", "subscription-box-profit"],
  fields: [
    { name: "totalSubscribers",  label: "Total Subscribers",       type: "number",   defaultValue: 1000, min: 0 },
    { name: "monthlyChurnRate",  label: "Monthly Churn Rate %",    type: "percent",  defaultValue: 5,    min: 0, max: 100 },
    { name: "avgRevenuePerUser", label: "Avg. Revenue Per User / mo", type: "currency", defaultValue: 60, min: 0 },
    { name: "targetChurnRate",   label: "Target Churn Rate %",     type: "percent",  defaultValue: 3,    min: 0, max: 100, helpText: "What you're aiming to reduce churn to" },
  ],
  outputs: [
    { key: "churnedCustomersMonthly", label: "Customers Lost / Month",  format: "number", highlight: true },
    { key: "lostMrrMonthly",     label: "Lost MRR / Month",         format: "currency", highlight: true },
    { key: "lostArrAnnual",      label: "Lost ARR (annualized)",    format: "currency", highlight: true },
    { key: "annualChurnRateEquivalent", label: "Annualized Churn Rate %", format: "percent" },
    { key: "mrrSavedAtTarget",   label: "MRR Saved at Target Churn", format: "currency", highlight: true },
    { key: "arrSavedAtTarget",   label: "ARR Saved at Target Churn", format: "currency", highlight: true },
  ],
  chartKeys: ["lostMrrMonthly", "mrrSavedAtTarget"],
  compute(v) {
    const churnedCustomersMonthly = (v.totalSubscribers * v.monthlyChurnRate) / 100;
    const lostMrrMonthly = churnedCustomersMonthly * v.avgRevenuePerUser;
    const lostArrAnnual = lostMrrMonthly * 12;
    const annualChurnRateEquivalent = 100 * (1 - Math.pow(1 - v.monthlyChurnRate / 100, 12));
    const churnedAtTarget = (v.totalSubscribers * v.targetChurnRate) / 100;
    const lostMrrAtTarget = churnedAtTarget * v.avgRevenuePerUser;
    const mrrSavedAtTarget = lostMrrMonthly - lostMrrAtTarget;
    const arrSavedAtTarget = mrrSavedAtTarget * 12;
    return { churnedCustomersMonthly, lostMrrMonthly, lostArrAnnual, annualChurnRateEquivalent, mrrSavedAtTarget, arrSavedAtTarget };
  },
  seoContent: {
    intro: `A "small" monthly churn rate compounds into a surprisingly large annual customer loss — 5% monthly churn means losing nearly half your customer base over a year if unaddressed. This calculator translates your churn rate into real dollars lost, and shows exactly how much revenue you'd protect by hitting a lower target churn rate.`,
    howToSteps: [
      "Enter your **total subscriber count**.",
      "Enter your **monthly churn rate %**.",
      "Enter your **average revenue per user (ARPU)** per month.",
      "Set a **target churn rate** you're aiming to achieve.",
      "Review lost MRR/ARR at your current rate, and how much you'd save by hitting your target.",
    ],
    formula: `Customers Lost / Month = Total Subscribers × Monthly Churn %\n\nLost MRR = Customers Lost × ARPU\n\nAnnualized Churn Rate = 1 − (1 − Monthly Churn)^12`,
    workedExample: `Subscribers: 1,000. Monthly churn: 5%. ARPU: $60. Target churn: 3%.\n\nCustomers Lost/Month = 1,000 × 5% = 50\nLost MRR = 50 × $60 = $3,000/month → $36,000/year\nAnnualized Churn Rate = 1 − (0.95)^12 ≈ 46%\nAt 3% target churn: Customers Lost = 30, Lost MRR = $1,800 → MRR Saved = $1,200/month ($14,400/year)`,
    faqs: [
      { q: "What is a good SaaS churn rate?", a: "For SMB-focused SaaS, monthly churn of 3–5% (annualized ~30–45%) is common. Enterprise SaaS typically sees much lower churn, often under 1% monthly (annualized under 10%), due to longer contracts and higher switching costs." },
      { q: "Why is annualized churn much higher than monthly churn?", a: "Churn compounds — losing 5% of remaining customers every single month, month after month, results in a much larger cumulative loss over a full year than simply multiplying 5% × 12, because the base shrinks each month." },
      { q: "What's the difference between customer churn and revenue churn?", a: "Customer churn counts the number of customers lost; revenue churn (or MRR churn) accounts for the dollar value lost, which can differ significantly if the customers who churn have above- or below-average revenue." },
      { q: "How much is reducing churn worth?", a: "Often more than acquiring new customers of the same value, since reducing churn compounds: every retained customer keeps contributing revenue in every future month, not just the current one." },
      { q: "What causes high SaaS churn?", a: "Common causes include poor onboarding, weak product-market fit for a segment, insufficient customer success engagement, pricing misalignment, and competitive pressure. Exit surveys and cohort analysis help pinpoint the specific driver." },
    ],
  },
};

export default config;