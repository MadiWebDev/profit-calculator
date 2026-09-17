import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "burn-rate-runway",
  title: "Startup Burn Rate & Runway Calculator",
  shortTitle: "Burn Rate & Runway",
  description: "Calculate your monthly burn rate and exactly how many months of runway your cash balance provides.",
  metaDescription: "Free burn rate and runway calculator. Enter cash balance, monthly revenue, and monthly expenses to calculate net burn rate, runway in months, and zero-cash date.",
  keywords: ["burn rate calculator", "runway calculator", "startup runway calculator", "cash runway calculator", "net burn calculator"],
  icon: "🔥",
  category: "saas",
  relatedSlugs: ["saas-mrr", "ltv-cac", "break-even-point"],
  fields: [
    { name: "cashBalance",      label: "Current Cash Balance",     type: "currency", defaultValue: 500000, min: 0 },
    { name: "monthlyRevenue",   label: "Monthly Revenue",          type: "currency", defaultValue: 25000,  min: 0 },
    { name: "monthlyExpenses",  label: "Monthly Expenses",         type: "currency", defaultValue: 60000,  min: 0 },
    { name: "monthlyRevenueGrowthPct", label: "Monthly Revenue Growth %", type: "percent", defaultValue: 8, min: -50, max: 100, helpText: "Assumed month-over-month revenue growth rate" },
  ],
  outputs: [
    { key: "netBurnRate",       label: "Net Monthly Burn Rate",    format: "currency", highlight: true },
    { key: "grossBurnRate",     label: "Gross Monthly Burn Rate",  format: "currency" },
    { key: "runwayMonthsStatic", label: "Runway (months, static)", format: "number",   highlight: true, description: "Assuming no revenue growth" },
    { key: "runwayMonthsWithGrowth", label: "Runway (months, with growth)", format: "number", highlight: true, description: "Accounting for assumed revenue growth" },
    { key: "monthsToProfitability", label: "Months to Profitability", format: "number", description: "If revenue grows at the assumed rate" },
  ],
  chartKeys: ["monthlyRevenue", "monthlyExpenses", "netBurnRate"],
  compute(v) {
    const netBurnRate = v.monthlyExpenses - v.monthlyRevenue;
    const grossBurnRate = v.monthlyExpenses;
    const runwayMonthsStatic = netBurnRate > 0 ? v.cashBalance / netBurnRate : -1;
    // simulate month by month with revenue growth
    let cash = v.cashBalance;
    let revenue = v.monthlyRevenue;
    let months = 0;
    let monthsToProfitability = -1;
    const maxMonths = 600;
    while (cash > 0 && months < maxMonths) {
      const burn = v.monthlyExpenses - revenue;
      cash -= burn;
      if (revenue >= v.monthlyExpenses && monthsToProfitability === -1) monthsToProfitability = months;
      revenue = revenue * (1 + v.monthlyRevenueGrowthPct / 100);
      months++;
    }
    const runwayMonthsWithGrowth = months >= maxMonths ? -1 : months;
    return { netBurnRate, grossBurnRate, runwayMonthsStatic, runwayMonthsWithGrowth, monthsToProfitability };
  },
  seoContent: {
    intro: `Runway is the single most urgent number for any pre-profitability startup: how many months until the cash runs out at your current spending pace. This calculator shows your static runway (assuming flat revenue) and a growth-adjusted runway that accounts for revenue scaling — plus roughly when you'd hit profitability if that growth holds.`,
    howToSteps: [
      "Enter your **current cash balance**.",
      "Enter your **monthly revenue** and **monthly expenses**.",
      "Enter an assumed **monthly revenue growth rate** based on recent trends.",
      "Review your net burn rate, static runway, and growth-adjusted runway.",
    ],
    formula: `Net Burn Rate = Monthly Expenses − Monthly Revenue\n\nStatic Runway = Cash Balance ÷ Net Burn Rate\n\nGrowth-Adjusted Runway simulates cash month by month as revenue compounds at the assumed growth rate`,
    workedExample: `Cash: $500,000. Revenue: $25,000/mo. Expenses: $60,000/mo. Growth: 8%/mo.\n\nNet Burn Rate = $60,000 − $25,000 = $35,000/mo\nStatic Runway = $500,000 ÷ $35,000 ≈ 14.3 months\nWith 8% monthly revenue growth compounding, runway extends meaningfully further, and the model estimates when revenue would catch up to expenses (profitability), assuming expenses stay flat.`,
    faqs: [
      { q: "What is the difference between gross burn and net burn?", a: "Gross burn is total monthly spend regardless of revenue. Net burn subtracts revenue from spend, showing the actual rate your cash balance is declining — net burn is what determines your real runway." },
      { q: "How much runway should a startup keep?", a: "Most advisors recommend keeping at least 12–18 months of runway at all times, and starting to fundraise when you hit 6–9 months remaining, since raising capital itself typically takes 3–6 months." },
      { q: "Should I assume flat or growing revenue for runway planning?", a: "Conservative planning uses flat (static) revenue as a worst-case floor. A growth-adjusted projection is useful for a realistic best-case view, but shouldn't replace the static number when making critical cash decisions." },
      { q: "What expenses should be included in burn rate?", a: "All cash operating expenses: payroll, rent, software, marketing, contractor payments, and any other recurring cash outflows. Non-cash expenses like stock-based compensation depreciation typically aren't included in a cash burn calculation." },
      { q: "How can a startup extend its runway?", a: "Cut non-essential spend, renegotiate vendor contracts, delay non-critical hires, accelerate revenue collection (e.g. annual prepay discounts), or raise a bridge round before runway gets critically low." },
    ],
  },
};

export default config;