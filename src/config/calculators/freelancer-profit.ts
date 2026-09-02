import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "freelancer-profit",
  title: "Freelancer & Service Business Profit Calculator",
  shortTitle: "Freelancer Profit",
  description: "Calculate your real take-home profit as a freelancer after taxes, tools, and overhead.",
  metaDescription: "Free freelancer profit calculator. Enter hourly rate, hours worked, software costs, tax rate, and overhead to calculate take-home profit and effective hourly rate.",
  keywords: ["freelancer profit calculator", "freelancer income calculator", "self employed profit calculator", "freelance hourly rate calculator", "take home pay calculator freelancer"],
  icon: "💼",
  category: "freelance",
  relatedSlugs: ["profit-margin", "google-ads-roi"],
  fields: [
    { name: "hourlyRate",      label: "Billable Hourly Rate",      type: "currency", defaultValue: 75,   min: 0 },
    { name: "billableHours",   label: "Billable Hours per Month",  type: "number",   defaultValue: 80,   min: 0, helpText: "Actual hours billed to clients per month" },
    { name: "nonBillableHours",label: "Non-Billable Hours / Month", type: "number",  defaultValue: 40,   min: 0, helpText: "Admin, sales, marketing — unpaid work hours" },
    { name: "toolsCost",       label: "Tools & Software (monthly)",type: "currency", defaultValue: 150,  min: 0, helpText: "Adobe, Slack, project mgmt, subscriptions" },
    { name: "overhead",        label: "Monthly Overhead",          type: "currency", defaultValue: 200,  min: 0, helpText: "Office, internet, phone, coworking space" },
    { name: "taxRate",         label: "Tax Rate %",                type: "percent",  defaultValue: 25,   min: 0, max: 60, helpText: "Include self-employment tax + income tax estimate" },
    { name: "platformFees",    label: "Platform Fees (monthly)",   type: "currency", defaultValue: 0,    min: 0, helpText: "Upwork 10–20%, Fiverr 20%, agency fees, etc." },
  ],
  outputs: [
    { key: "takeHomeProfit",      label: "Take-Home Profit",       format: "currency", highlight: true },
    { key: "effectiveHourlyRate", label: "Effective Hourly Rate",  format: "currency", highlight: true, description: "Based on all hours worked (billable + non-billable)" },
    { key: "grossRevenue",        label: "Gross Revenue",          format: "currency" },
    { key: "taxAmount",           label: "Tax Amount",             format: "currency" },
    { key: "totalExpenses",       label: "Total Expenses",         format: "currency" },
    { key: "profitMargin",        label: "Profit Margin %",        format: "percent" },
    { key: "annualTakeHome",      label: "Annual Take-Home",       format: "currency" },
    { key: "requiredRate",        label: "Rate Needed for $100k/yr", format: "currency", description: "Hourly rate needed to net $100k/year" },
  ],
  chartKeys: ["toolsCost", "overhead", "taxAmount", "platformFees", "takeHomeProfit"],
  compute(v) {
    const grossRevenue = v.hourlyRate * v.billableHours;
    const platformFees = v.platformFees;
    const revenueAfterFees = grossRevenue - platformFees;
    const totalExpenses = v.toolsCost + v.overhead;
    const preTaxProfit = revenueAfterFees - totalExpenses;
    const taxAmount = preTaxProfit > 0 ? (preTaxProfit * v.taxRate) / 100 : 0;
    const takeHomeProfit = preTaxProfit - taxAmount;
    const totalHours = v.billableHours + v.nonBillableHours;
    const effectiveHourlyRate = totalHours > 0 ? takeHomeProfit / totalHours : 0;
    const profitMargin = grossRevenue > 0 ? (takeHomeProfit / grossRevenue) * 100 : 0;
    const annualTakeHome = takeHomeProfit * 12;
    // Rate needed for $100k take-home per year:
    const monthlyTarget = 100000 / 12;
  const grossNeeded = monthlyTarget / (1 - v.taxRate / 100) + totalExpenses + platformFees;
    const requiredRate = v.billableHours > 0 ? grossNeeded / v.billableHours : 0;
    return { takeHomeProfit, effectiveHourlyRate, grossRevenue, taxAmount, totalExpenses, profitMargin, annualTakeHome, requiredRate, toolsCost: v.toolsCost, overhead: v.overhead, platformFees };
  },
  seoContent: {
    intro: `Most freelancers focus on their billable hourly rate and forget the full picture: non-billable hours, self-employment taxes (which are higher than W-2 taxes), software subscriptions, overhead, and platform fees. This freelancer profit calculator gives you your real take-home number and, crucially, your effective hourly rate — what you actually earn for every hour of your life spent working.`,
    howToSteps: [
      "Enter your **billable hourly rate** — what you charge clients per hour.",
      "Enter your **billable hours per month** — actual hours invoiced to clients.",
      "Add your **non-billable hours** — time spent on admin, sales calls, emails, and marketing.",
      "List your **monthly tools & software costs** — every subscription adds up.",
      "Add your **monthly overhead** — office, internet, phone, professional development.",
      "Set your **tax rate %** — self-employed individuals typically pay 25–35% including SE tax.",
      "Add any **platform fees** if you work through Upwork (10–20%) or Fiverr (20%).",
      "Review your true take-home profit and effective hourly rate.",
    ],
    formula: `Gross Revenue = Hourly Rate × Billable Hours\nRevenue After Fees = Gross Revenue − Platform Fees\nPre-Tax Profit = Revenue After Fees − Tools − Overhead\nTax Amount = Pre-Tax Profit × Tax Rate %\nTake-Home Profit = Pre-Tax Profit − Tax Amount\nEffective Hourly Rate = Take-Home Profit ÷ (Billable + Non-Billable Hours)`,
    workedExample: `Hourly rate: $75. Billable hours: 80/mo. Non-billable hours: 40/mo. Tools: $150. Overhead: $200. Tax: 25%.\n\nGross Revenue = $75 × 80 = $6,000\nExpenses = $150 + $200 = $350\nPre-Tax Profit = $6,000 − $350 = $5,650\nTax = $5,650 × 25% = $1,412.50\nTake-Home = $5,650 − $1,412.50 = $4,237.50\nEffective Rate = $4,237.50 ÷ 120 hrs = $35.31/hr`,
    faqs: [
      { q: "What tax rate should freelancers use in this calculator?", a: "In the US, freelancers pay self-employment tax (15.3% on first $160k) plus federal income tax. A blended effective rate of 25–30% is a reasonable estimate for most freelancers. Add state income tax if applicable. Consult a CPA for precise planning." },
      { q: "What is the effective hourly rate for freelancers?", a: "Your effective hourly rate is your take-home profit divided by all hours worked — including non-billable time. A $100/hr freelancer spending equal time on non-billable work has an effective rate of $50/hr before taxes. This is your true hourly income." },
      { q: "Should I include Upwork fees in the calculator?", a: "Yes. Upwork charges 10% on earnings over $10,000 with a client, and 20% on new client earnings up to $10k. Fiverr charges 20% on all earnings. These are significant costs that directly reduce your take-home profit." },
      { q: "How do I price my freelance services for a target income?", a: "Use the 'Rate Needed for $100k/yr' output as a starting point. Then adjust your target, billable hours, and expenses to find a rate that's achievable in your market and meets your income goals." },
      { q: "What expenses can freelancers deduct from taxes?", a: "Common deductible expenses include home office, internet, phone (business portion), software subscriptions, professional development, equipment, and health insurance premiums. Always work with a qualified tax professional to maximize legitimate deductions." },
    ],
  },
};

export default config;
