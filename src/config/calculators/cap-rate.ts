import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "cap-rate",
  title: "Cap Rate Calculator",
  shortTitle: "Cap Rate",
  description: "Calculate a property's capitalization rate from purchase price, rental income, and operating expenses.",
  metaDescription: "Free cap rate calculator. Enter property price, gross rental income, and operating expenses to instantly calculate net operating income (NOI) and cap rate %.",
  keywords: ["cap rate calculator", "capitalization rate calculator", "noi calculator", "commercial real estate cap rate", "rental property cap rate"],
  icon: "📐",
  category: "real-estate",
  relatedSlugs: ["rental-property-roi", "airbnb-profit", "house-flipping-profit"],
  fields: [
    { name: "purchasePrice",     label: "Purchase Price / Value",  type: "currency", defaultValue: 400000, min: 0 },
    { name: "grossAnnualIncome", label: "Gross Annual Rental Income", type: "currency", defaultValue: 42000, min: 0 },
    { name: "vacancyRate",       label: "Vacancy & Credit Loss %", type: "percent",  defaultValue: 5,      min: 0, max: 100 },
    { name: "operatingExpenses", label: "Annual Operating Expenses", type: "currency", defaultValue: 12000, min: 0, helpText: "Taxes, insurance, maintenance, management — excludes mortgage" },
  ],
  outputs: [
    { key: "capRate",            label: "Cap Rate %",             format: "percent", highlight: true },
    { key: "noi",                label: "Net Operating Income",   format: "currency", highlight: true },
    { key: "effectiveGrossIncome", label: "Effective Gross Income", format: "currency" },
    { key: "expenseRatio",       label: "Operating Expense Ratio %", format: "percent" },
    { key: "vacancyLoss",        label: "Vacancy & Credit Loss",  format: "currency" },
    { key: "impliedValueAt6Pct", label: "Implied Value at 6% Cap", format: "currency", description: "What this NOI would be worth at a 6% target cap rate" },
  ],
  chartKeys: ["operatingExpenses", "vacancyLoss", "noi"],
  compute(v) {
    const vacancyLoss = (v.grossAnnualIncome * v.vacancyRate) / 100;
    const effectiveGrossIncome = v.grossAnnualIncome - vacancyLoss;
    const noi = effectiveGrossIncome - v.operatingExpenses;
    const capRate = v.purchasePrice > 0 ? (noi / v.purchasePrice) * 100 : 0;
    const expenseRatio = effectiveGrossIncome > 0 ? (v.operatingExpenses / effectiveGrossIncome) * 100 : 0;
    const impliedValueAt6Pct = noi / 0.06;
    return { capRate, noi, effectiveGrossIncome, expenseRatio, vacancyLoss, impliedValueAt6Pct };
  },
  seoContent: {
    intro: `Cap rate is the fastest way to compare income properties regardless of how they're financed — it strips out your mortgage and simply asks: what does this property earn relative to what it costs? This calculator computes your Net Operating Income (NOI) and cap rate in seconds, and shows what your NOI implies about fair value at a target cap rate.`,
    howToSteps: [
      "Enter the **purchase price** (or current market value) of the property.",
      "Enter the **gross annual rental income** the property generates.",
      "Set a **vacancy & credit loss %** to reflect realistic, not 100% occupied, income.",
      "Add **annual operating expenses** — taxes, insurance, maintenance, management fees. Do not include mortgage payments; cap rate is calculated before financing.",
      "Review your NOI, cap rate, and implied value at a target cap rate.",
    ],
    formula: `Effective Gross Income = Gross Income − Vacancy & Credit Loss\n\nNOI = Effective Gross Income − Operating Expenses\n\nCap Rate = (NOI ÷ Purchase Price) × 100`,
    workedExample: `Price: $400,000. Gross income: $42,000. Vacancy: 5%. Operating expenses: $12,000.\n\nVacancy Loss = 5% × $42,000 = $2,100\nEffective Gross Income = $42,000 − $2,100 = $39,900\nNOI = $39,900 − $12,000 = $27,900\nCap Rate = $27,900 ÷ $400,000 = 6.98%`,
    faqs: [
      { q: "What is a good cap rate for rental property?", a: "It depends heavily on market and asset class. Stable, low-risk markets often see 4–6% cap rates; higher-risk or higher-yield markets can see 8–12%. Compare within the same market and property type rather than using one universal target." },
      { q: "Does cap rate include the mortgage payment?", a: "No — cap rate is calculated on NOI before any mortgage or debt service, which is exactly what makes it useful for comparing properties independent of how each buyer chooses to finance them." },
      { q: "What's the difference between cap rate and cash-on-cash return?", a: "Cap rate uses the full purchase price and ignores financing. Cash-on-cash return uses only your actual cash invested (down payment + closing + repairs) and accounts for mortgage payments — it's more relevant once you know your financing terms." },
      { q: "How do I calculate NOI?", a: "NOI = Effective Gross Income (rental income minus vacancy losses) minus operating expenses like property tax, insurance, maintenance, and property management. Mortgage principal, interest, and capital expenditures are excluded." },
      { q: "Why do cap rates vary by market?", a: "Cap rates reflect perceived risk and expected appreciation. Low cap rates usually mean investors expect strong appreciation and stability (major metros); high cap rates usually compensate for higher risk, lower growth, or more management-intensive assets." },
    ],
  },
};

export default config;
