import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "rental-property-roi",
  title: "Rental Property ROI Calculator",
  shortTitle: "Rental Property ROI",
  description: "Calculate cash-on-cash return, cap rate, and monthly cash flow for a rental property investment.",
  metaDescription: "Free rental property ROI calculator. Enter purchase price, down payment, rent, and expenses to calculate cash flow, cash-on-cash return, cap rate, and break-even occupancy.",
  keywords: ["rental property roi calculator", "cash on cash return calculator", "cap rate calculator", "rental property cash flow calculator", "real estate investment calculator"],
  icon: "🏠",
  category: "real-estate",
  relatedSlugs: ["cap-rate", "airbnb-profit", "mortgage-affordability"],
  fields: [
    { name: "purchasePrice",   label: "Purchase Price",          type: "currency", defaultValue: 250000, min: 0 },
    { name: "downPayment",     label: "Down Payment",            type: "currency", defaultValue: 50000,  min: 0 },
    { name: "closingCosts",    label: "Closing Costs",           type: "currency", defaultValue: 5000,   min: 0 },
    { name: "renovationCosts", label: "Renovation / Repair Costs", type: "currency", defaultValue: 10000, min: 0 },
    { name: "monthlyRent",     label: "Monthly Rent",            type: "currency", defaultValue: 2200,   min: 0 },
    { name: "monthlyExpenses", label: "Monthly Expenses",        type: "currency", defaultValue: 600,    min: 0, helpText: "Taxes, insurance, maintenance, property management" },
    { name: "monthlyMortgage", label: "Monthly Mortgage Payment", type: "currency", defaultValue: 1100,  min: 0 },
    { name: "vacancyRate",     label: "Vacancy Rate %",          type: "percent",  defaultValue: 5, min: 0, max: 100, helpText: "Expected % of the year the unit sits vacant" },
  ],
  outputs: [
    { key: "monthlyCashFlow",     label: "Monthly Cash Flow",       format: "currency", highlight: true },
    { key: "annualCashFlow",      label: "Annual Cash Flow",        format: "currency", highlight: true },
    { key: "cashOnCashReturn",    label: "Cash-on-Cash Return %",   format: "percent",  highlight: true },
    { key: "capRate",             label: "Cap Rate %",              format: "percent",  highlight: true },
    { key: "totalCashInvested",   label: "Total Cash Invested",     format: "currency" },
    { key: "noiAnnual",           label: "Net Operating Income (annual)", format: "currency" },
    { key: "grossRentMultiplier", label: "Gross Rent Multiplier",   format: "multiplier" },
    { key: "breakEvenOccupancy",  label: "Break-Even Occupancy %",  format: "percent", description: "Minimum occupancy to cover expenses + mortgage" },
  ],
  chartKeys: ["monthlyExpenses", "monthlyMortgage", "monthlyCashFlow"],
  compute(v) {
    const totalCashInvested = v.downPayment + v.closingCosts + v.renovationCosts;
    const effectiveMonthlyRent = v.monthlyRent * (1 - v.vacancyRate / 100);
    const monthlyCashFlow = effectiveMonthlyRent - v.monthlyExpenses - v.monthlyMortgage;
    const annualCashFlow = monthlyCashFlow * 12;
    const cashOnCashReturn = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;
    const noiAnnual = (effectiveMonthlyRent - v.monthlyExpenses) * 12;
    const capRate = v.purchasePrice > 0 ? (noiAnnual / v.purchasePrice) * 100 : 0;
    const grossRentMultiplier = v.monthlyRent > 0 ? v.purchasePrice / (v.monthlyRent * 12) : 0;
    const breakEvenOccupancy = v.monthlyRent > 0 ? ((v.monthlyExpenses + v.monthlyMortgage) / v.monthlyRent) * 100 : 0;
    return { monthlyCashFlow, annualCashFlow, cashOnCashReturn, capRate, totalCashInvested, noiAnnual, grossRentMultiplier, breakEvenOccupancy, monthlyExpenses: v.monthlyExpenses, monthlyMortgage: v.monthlyMortgage };
  },
  seoContent: {
    intro: `Buying a rental property is easy — knowing whether it's actually a good investment is the hard part. This calculator turns your purchase price, financing, rent, and expenses into the three numbers serious investors check first: monthly cash flow, cash-on-cash return, and cap rate. Run your numbers before you make an offer, not after.`,
    howToSteps: [
      "Enter the **purchase price** of the property.",
      "Enter your **down payment** and **closing costs**.",
      "Add any **renovation or repair costs** needed before renting it out.",
      "Enter the **monthly rent** you expect to charge.",
      "Add your **monthly expenses** — taxes, insurance, maintenance, HOA, property management.",
      "Enter your **monthly mortgage payment** (principal + interest).",
      "Set an expected **vacancy rate** to see realistic, not best-case, numbers.",
    ],
    formula: `Total Cash Invested = Down Payment + Closing Costs + Renovation Costs\n\nMonthly Cash Flow = (Rent × (1 − Vacancy %)) − Expenses − Mortgage\n\nCash-on-Cash Return = (Annual Cash Flow ÷ Total Cash Invested) × 100\n\nCap Rate = (Annual NOI ÷ Purchase Price) × 100`,
    workedExample: `Purchase price: $250,000. Down payment: $50,000. Closing costs: $5,000. Renovation: $10,000. Rent: $2,200/mo. Expenses: $600/mo. Mortgage: $1,100/mo. Vacancy: 5%.\n\nTotal Cash Invested = $50,000 + $5,000 + $10,000 = $65,000\nEffective Rent = $2,200 × 95% = $2,090\nMonthly Cash Flow = $2,090 − $600 − $1,100 = $390\nAnnual Cash Flow = $390 × 12 = $4,680\nCash-on-Cash Return = $4,680 ÷ $65,000 = 7.2%\nAnnual NOI = ($2,090 − $600) × 12 = $17,880\nCap Rate = $17,880 ÷ $250,000 = 7.2%`,
    faqs: [
      { q: "What is a good cash-on-cash return for rental property?", a: "Most investors target 8–12% cash-on-cash return. Anything above 8% is generally considered solid; below 5% may not justify the risk and effort of being a landlord unless you're primarily banking on appreciation." },
      { q: "What is a good cap rate?", a: "Cap rates of 4–10% are typical depending on market. Higher cap rates (8%+) usually mean higher risk or lower-appreciation markets; lower cap rates (4–5%) are common in expensive, high-demand cities where price growth carries more of the return." },
      { q: "What's the difference between cap rate and cash-on-cash return?", a: "Cap rate ignores financing and measures the property's return based on purchase price alone. Cash-on-cash return only looks at the actual cash you invested, so it accounts for your mortgage and leverage — it's usually the more useful number for financed deals." },
      { q: "Should I include vacancy rate in my rental calculations?", a: "Yes. Even great rentals sit empty between tenants. Budgeting 5–8% vacancy (roughly 3–4 weeks a year) keeps your cash flow projection realistic instead of a best-case fantasy." },
      { q: "What expenses should I include in a rental property calculation?", a: "Property taxes, insurance, routine maintenance (budget 1% of property value/year), property management fees (8–10% of rent if outsourced), HOA dues, and a reserve for capital expenditures like roofs and HVAC systems." },
    ],
  },
};

export default config;