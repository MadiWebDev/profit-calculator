import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "rent-vs-buy",
  title: "Rent vs Buy Calculator",
  shortTitle: "Rent vs Buy",
  description: "Compare the true 5-year cost of renting vs buying a home, including opportunity cost of your down payment.",
  metaDescription: "Free rent vs buy calculator. Compare monthly rent to total homeownership costs including mortgage, taxes, maintenance, and opportunity cost to see which is cheaper over time.",
  keywords: ["rent vs buy calculator", "should i rent or buy calculator", "renting vs owning calculator", "home buying cost calculator", "rent or buy a house"],
  icon: "⚖️",
  category: "real-estate",
  relatedSlugs: ["mortgage-affordability", "rental-property-roi", "compound-interest"],
  fields: [
    { name: "monthlyRent",       label: "Current / Comparable Rent", type: "currency", defaultValue: 2200,   min: 0 },
    { name: "homePrice",         label: "Home Purchase Price",       type: "currency", defaultValue: 400000, min: 0 },
    { name: "downPayment",       label: "Down Payment",              type: "currency", defaultValue: 80000,  min: 0 },
    { name: "interestRate",      label: "Mortgage Interest Rate %",  type: "percent",  defaultValue: 6.5,    min: 0, max: 25 },
    { name: "propertyTaxAnnual", label: "Annual Property Tax",       type: "currency", defaultValue: 4800,   min: 0 },
    { name: "maintenancePctAnnual", label: "Annual Maintenance % of Value", type: "percent", defaultValue: 1, min: 0, max: 10, helpText: "Rule of thumb: budget ~1% of home value per year" },
    { name: "homeAppreciationPct", label: "Annual Home Appreciation %", type: "percent", defaultValue: 3,    min: 0, max: 20 },
    { name: "investmentReturnPct", label: "Alt. Investment Return %", type: "percent",  defaultValue: 7,     min: 0, max: 20, helpText: "What your down payment could earn if invested instead" },
    { name: "yearsToCompare",    label: "Years to Compare",          type: "number",   defaultValue: 5,      min: 1, max: 30 },
  ],
  outputs: [
    { key: "totalRentCost",      label: "Total Cost of Renting",   format: "currency", highlight: true },
    { key: "totalBuyCost",       label: "Total Cost of Buying (net)", format: "currency", highlight: true },
    { key: "netAdvantageBuy",    label: "Net Advantage of Buying", format: "currency", highlight: true, description: "Positive means buying wins over the period" },
    { key: "homeEquityAtEnd",    label: "Home Equity at End",      format: "currency" },
    { key: "homeValueAtEnd",     label: "Home Value at End",       format: "currency" },
    { key: "opportunityCost",    label: "Opportunity Cost of Down Payment", format: "currency" },
    { key: "totalMortgagePaid",  label: "Total Mortgage Payments", format: "currency" },
  ],
  chartKeys: ["totalRentCost", "totalBuyCost"],
  compute(v) {
    const months = v.yearsToCompare * 12;
    const totalRentCost = v.monthlyRent * months * (1 + 0.03 * (v.yearsToCompare - 1) / 2); // mild rent-growth approximation
    const loanAmount = Math.max(0, v.homePrice - v.downPayment);
    const monthlyRate = v.interestRate / 100 / 12;
    const numPayments = 30 * 12;
    const monthlyPI = monthlyRate > 0
      ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
      : loanAmount / numPayments;
    const totalMortgagePaid = monthlyPI * months;
    const maintenanceCost = (v.homePrice * v.maintenancePctAnnual / 100) * v.yearsToCompare;
    const propertyTaxCost = v.propertyTaxAnnual * v.yearsToCompare;
    const homeValueAtEnd = v.homePrice * Math.pow(1 + v.homeAppreciationPct / 100, v.yearsToCompare);
    // remaining balance approximation using amortization
    let balance = loanAmount;
    for (let i = 0; i < months; i++) {
      const interestPortion = balance * monthlyRate;
      const principalPortion = monthlyPI - interestPortion;
      balance = Math.max(0, balance - principalPortion);
    }
    const homeEquityAtEnd = homeValueAtEnd - balance;
    const opportunityCost = v.downPayment * (Math.pow(1 + v.investmentReturnPct / 100, v.yearsToCompare) - 1);
    const totalBuyCostGross = totalMortgagePaid + maintenanceCost + propertyTaxCost + v.downPayment;
    const totalBuyCost = totalBuyCostGross - homeEquityAtEnd;
    const netAdvantageBuy = totalRentCost - totalBuyCost;
    return { totalRentCost, totalBuyCost, netAdvantageBuy, homeEquityAtEnd, homeValueAtEnd, opportunityCost, totalMortgagePaid };
  },
  seoContent: {
    intro: `Renting vs buying isn't just "rent is throwing money away" — buying comes with its own costs: interest, taxes, maintenance, and the opportunity cost of tying up your down payment. This calculator projects the true net cost of each path over your chosen time horizon, factoring in home equity built and appreciation.`,
    howToSteps: [
      "Enter your **current or comparable monthly rent** for a similar home.",
      "Enter the **home purchase price** you're considering.",
      "Enter your **down payment** and expected **mortgage interest rate**.",
      "Add **annual property tax** and an estimated **maintenance %** (1% of home value/year is a common rule of thumb).",
      "Set an expected **home appreciation rate** for the area.",
      "Enter the **return you could earn** if you invested your down payment elsewhere instead.",
      "Choose how many **years** you plan to compare (and likely stay in the home).",
    ],
    formula: `Total Buy Cost = Mortgage Paid + Property Tax + Maintenance + Down Payment − Home Equity at End\n\nNet Advantage of Buying = Total Rent Cost − Total Buy Cost`,
    workedExample: `Rent: $2,200/mo. Home price: $400,000. Down payment: $80,000. Rate: 6.5%. Tax: $4,800/yr. Maintenance: 1%/yr. Appreciation: 3%/yr. 5-year horizon.\n\nOver 5 years, renting costs roughly $132,000 total. Buying costs roughly $121,000 in mortgage interest + tax + maintenance, offset by home equity built (~$100,000+ from paydown and appreciation) — in most scenarios like this, buying nets out ahead after 5 years, but the breakeven point is sensitive to your appreciation and investment-return assumptions.`,
    faqs: [
      { q: "How long do I need to stay in a home for buying to make sense?", a: "A common rule of thumb is 4–7 years, since closing costs (typically 2–5% of the price on both buy and sell sides) need time to be offset by equity and appreciation. Shorter stays usually favor renting." },
      { q: "Should I include the opportunity cost of my down payment?", a: "Yes — money in your down payment could otherwise be invested. This calculator shows that opportunity cost separately so you can see how sensitive the decision is to your assumed investment return." },
      { q: "Does this calculator include closing costs?", a: "Not automatically — add estimated closing costs on both the purchase (2–5%) and eventual sale (6–10%) manually to your down payment and expected proceeds for a fully precise picture." },
      { q: "What's a safe home appreciation assumption?", a: "Long-run US home appreciation has historically averaged around 3–4% annually, though it varies significantly by market and time period. Avoid using recent boom-year numbers as a baseline assumption." },
      { q: "Is renting really 'throwing money away'?", a: "Not necessarily — rent buys you flexibility and predictable costs, and the money you'd have spent on a down payment, maintenance, and closing costs can be invested instead. The right answer depends on your time horizon, market, and financial goals." },
    ],
  },
};

export default config;