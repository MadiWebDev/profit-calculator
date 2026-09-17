import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "dividend-yield",
  title: "Dividend Yield & Income Calculator",
  shortTitle: "Dividend Yield", 
  description: "Calculate dividend yield, annual income, and projected dividend growth from your stock holdings.",
  metaDescription: "Free dividend yield calculator. Enter share price, annual dividend, shares owned, and growth rate to calculate yield %, annual income, and 10-year projected income.",
  keywords: ["dividend yield calculator", "dividend income calculator", "dividend growth calculator", "dividend reinvestment calculator", "yield on cost calculator"],
  icon: "💰",
  category: "investing",
  relatedSlugs: ["stock-profit", "compound-interest", "dollar-cost-averaging"],
  fields: [
    { name: "sharePrice",       label: "Current Share Price",       type: "currency", defaultValue: 60,   min: 0 },
    { name: "annualDividendPerShare", label: "Annual Dividend / Share", type: "currency", defaultValue: 2.40, min: 0 },
    { name: "sharesOwned",      label: "Shares Owned",              type: "number",   defaultValue: 200,  min: 0 },
    { name: "costBasisPerShare",label: "Your Avg. Cost Basis / Share", type: "currency", defaultValue: 45, min: 0 },
    { name: "dividendGrowthPct",label: "Expected Annual Dividend Growth %", type: "percent", defaultValue: 6, min: 0, max: 50 },
    { name: "yearsProjected",   label: "Years to Project",          type: "number",   defaultValue: 10,   min: 1, max: 40 },
  ],
  outputs: [
    { key: "dividendYield",     label: "Dividend Yield %",       format: "percent", highlight: true },
    { key: "yieldOnCost",       label: "Yield on Cost %",        format: "percent", highlight: true },
    { key: "annualIncome",      label: "Current Annual Income",  format: "currency", highlight: true },
    { key: "monthlyIncome",     label: "Avg. Monthly Income",    format: "currency" },
    { key: "projectedAnnualIncome", label: "Projected Annual Income (future)", format: "currency", highlight: true },
    { key: "totalProjectedIncome", label: "Cumulative Income Over Period", format: "currency" },
  ],
  chartKeys: ["annualIncome", "projectedAnnualIncome"],
  compute(v) {
    const dividendYield = v.sharePrice > 0 ? (v.annualDividendPerShare / v.sharePrice) * 100 : 0;
    const yieldOnCost = v.costBasisPerShare > 0 ? (v.annualDividendPerShare / v.costBasisPerShare) * 100 : 0;
    const annualIncome = v.annualDividendPerShare * v.sharesOwned;
    const monthlyIncome = annualIncome / 12;
    const projectedDividendPerShare = v.annualDividendPerShare * Math.pow(1 + v.dividendGrowthPct / 100, v.yearsProjected);
    const projectedAnnualIncome = projectedDividendPerShare * v.sharesOwned;
    let totalProjectedIncome = 0;
    for (let y = 1; y <= v.yearsProjected; y++) {
      totalProjectedIncome += v.annualDividendPerShare * Math.pow(1 + v.dividendGrowthPct / 100, y) * v.sharesOwned;
    }
    return { dividendYield, yieldOnCost, annualIncome, monthlyIncome, projectedAnnualIncome, totalProjectedIncome };
  },
  seoContent: {
    intro: `Dividend yield tells you what you'd earn buying today, but "yield on cost" tells you what your original investment is actually paying you now — a number that grows every year a company raises its dividend. This calculator shows both, plus a multi-year income projection if the dividend keeps growing at your assumed rate.`,
    howToSteps: [
      "Enter the **current share price** of the stock.",
      "Enter the **annual dividend per share** it currently pays.",
      "Enter the **number of shares** you own.",
      "Enter your **average cost basis per share** to calculate yield on cost.",
      "Set an **expected annual dividend growth rate** based on the company's history.",
      "Choose **how many years** to project income forward.",
    ],
    formula: `Dividend Yield = (Annual Dividend Per Share ÷ Share Price) × 100\n\nYield on Cost = (Annual Dividend Per Share ÷ Cost Basis Per Share) × 100\n\nProjected Dividend = Current Dividend × (1 + Growth %)^Years`,
    workedExample: `Share price: $60. Dividend: $2.40/share. Shares: 200. Cost basis: $45/share. Growth: 6%/yr, 10-year projection.\n\nDividend Yield = $2.40 ÷ $60 = 4.0%\nYield on Cost = $2.40 ÷ $45 = 5.3%\nAnnual Income Today = $2.40 × 200 = $480\nProjected Dividend in 10 yrs = $2.40 × (1.06)^10 ≈ $4.30\nProjected Annual Income = $4.30 × 200 ≈ $860`,
    faqs: [
      { q: "What is a good dividend yield?", a: "It depends on the sector — utilities and REITs often yield 4–6%, while growth stocks may yield 0–2% but grow dividends faster. Very high yields (8%+) can signal financial trouble, so check the payout ratio and dividend history before assuming it's sustainable." },
      { q: "What is yield on cost?", a: "Yield on cost divides the current dividend by what you originally paid per share, not the current price. It shows the real income return on your initial investment and rises over time as dividends grow." },
      { q: "Does dividend growth compound like reinvested dividends?", a: "This calculator projects the dividend payment growing, not necessarily reinvestment. If you reinvest dividends to buy more shares (DRIP), your actual income growth will be faster than the raw dividend growth rate alone." },
      { q: "What is a dividend payout ratio?", a: "The payout ratio is dividends paid divided by net income (or free cash flow). A payout ratio consistently above 80–100% can signal the dividend is at risk of being cut, especially if earnings decline." },
      { q: "Are dividends taxed differently than capital gains?", a: "Qualified dividends in the US are typically taxed at the same favorable rates as long-term capital gains, while non-qualified/ordinary dividends are taxed as regular income. Rules vary by country — consult a tax professional." },
    ],
  },
};

export default config;