import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "compound-interest",
  title: "Compound Interest Calculator",
  shortTitle: "Compound Interest",
  description: "Calculate how your savings or investment grows over time with compound interest and monthly contributions.",
  metaDescription: "Free compound interest calculator. Enter principal, interest rate, contribution amount, and time to calculate future value, total contributions, and total interest earned.",
  keywords: ["compound interest calculator", "investment growth calculator", "compound interest with contributions", "future value calculator", "savings growth calculator"],
  icon: "🧮",
  category: "investing",
  relatedSlugs: ["dividend-yield", "dollar-cost-averaging", "stock-profit"],
  fields: [
    { name: "principal",         label: "Starting Principal",      type: "currency", defaultValue: 10000, min: 0 },
    { name: "monthlyContribution", label: "Monthly Contribution",  type: "currency", defaultValue: 300,   min: 0 },
    { name: "annualRate",        label: "Expected Annual Return %",type: "percent",  defaultValue: 7,     min: 0, max: 50 },
    { name: "years",             label: "Years to Grow",           type: "number",   defaultValue: 20,    min: 1, max: 60 },
    { name: "compoundsPerYear",  label: "Compounds per Year",      type: "number",   defaultValue: 12,    min: 1, max: 365, helpText: "12 = monthly compounding, 1 = annual" },
  ],
  outputs: [
    { key: "futureValue",       label: "Future Value",          format: "currency", highlight: true },
    { key: "totalContributions",label: "Total Contributions",   format: "currency" },
    { key: "totalInterestEarned", label: "Total Interest Earned", format: "currency", highlight: true },
    { key: "startingPrincipal", label: "Starting Principal",    format: "currency" },
    { key: "growthMultiple",    label: "Growth Multiple",       format: "multiplier", description: "Future value ÷ total money put in" },
  ],
  chartKeys: ["startingPrincipal", "totalContributions", "totalInterestEarned"],
  compute(v) {
    const n = v.compoundsPerYear;
    const ratePerPeriod = v.annualRate / 100 / n;
    const totalPeriods = v.years * n;
    const contributionPerPeriod = (v.monthlyContribution * 12) / n;
    let balance = v.principal;
    for (let i = 0; i < totalPeriods; i++) {
      balance = balance * (1 + ratePerPeriod) + contributionPerPeriod;
    }
    const futureValue = balance;
    const totalContributions = v.principal + v.monthlyContribution * 12 * v.years;
    const totalInterestEarned = futureValue - totalContributions;
    const growthMultiple = totalContributions > 0 ? futureValue / totalContributions : 0;
    return { futureValue, totalContributions, totalInterestEarned, startingPrincipal: v.principal, growthMultiple };
  },
  seoContent: {
    intro: `Compound interest is the engine behind almost every long-term wealth-building strategy — small, regular contributions plus time can outgrow a much larger lump sum invested for less time. This calculator models your exact contribution schedule and compounding frequency to show the real future value of your savings or investment plan.`,
    howToSteps: [
      "Enter your **starting principal** — how much you're investing today.",
      "Enter your **monthly contribution** — how much you'll add regularly.",
      "Set your **expected annual return %** — historical stock market average is roughly 7–10% before inflation.",
      "Choose the **number of years** you plan to let it grow.",
      "Set the **compounding frequency** — most brokerage/savings accounts compound monthly or daily.",
      "Review future value, total contributions, and total interest earned.",
    ],
    formula: `Balance compounds each period as:\nBalance = Balance × (1 + rate/n) + Contribution per period\n\nrepeated for n × Years periods, where n = compounds per year`,
    workedExample: `Principal: $10,000. Monthly contribution: $300. Rate: 7%/yr, compounded monthly. 20 years.\n\nTotal Contributions = $10,000 + ($300 × 12 × 20) = $82,000\nFuture Value ≈ $172,000 (approx., compounding monthly at 7%)\nTotal Interest Earned ≈ $90,000\nGrowth Multiple ≈ 2.1x`,
    faqs: [
      { q: "What's the difference between simple and compound interest?", a: "Simple interest is calculated only on the original principal. Compound interest is calculated on the principal plus all previously earned interest, so your money grows faster and faster over time — the core reason starting early matters so much." },
      { q: "How does compounding frequency affect returns?", a: "More frequent compounding (daily vs. annually) results in slightly higher returns for the same nominal rate, since interest starts earning interest sooner. The difference is usually small compared to the impact of the rate itself and time invested." },
      { q: "What return rate should I assume for stocks?", a: "The S&P 500 has historically averaged roughly 10% annually before inflation (about 7% after inflation) over long periods, though any given year or decade can vary significantly. Use a conservative estimate for planning purposes." },
      { q: "Does this calculator account for inflation?", a: "No — this shows nominal future value. To estimate real (inflation-adjusted) purchasing power, subtract your expected inflation rate from the return rate before entering it, or discount the future value separately." },
      { q: "How much difference does starting early really make?", a: "A huge amount. Someone who invests for 10 years starting at 25 and then stops can end up with more money at 65 than someone who invests for 30 years starting at 35, purely because of the extra decade of compounding." },
    ],
  },
};

export default config;