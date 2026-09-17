import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "etf-fee-impact",
  title: "ETF Expense Ratio Impact Calculator",
  shortTitle: "ETF Fee Impact", 
  description: "See how much a fund's expense ratio really costs you in dollars over the long run.",
  metaDescription: "Free ETF expense ratio calculator. Enter investment amount, expense ratio, expected return, and years to see the true long-term dollar cost of fund fees.",
  keywords: ["etf expense ratio calculator", "mutual fund fee calculator", "expense ratio impact calculator", "index fund fee calculator", "investment fee calculator"],
  icon: "📉",
  category: "investing",
  relatedSlugs: ["compound-interest", "dollar-cost-averaging", "dividend-yield"],
  fields: [
    { name: "investmentAmount", label: "Initial Investment",       type: "currency", defaultValue: 20000, min: 0 },
    { name: "monthlyContribution", label: "Monthly Contribution",  type: "currency", defaultValue: 500,   min: 0 },
    { name: "expenseRatioPct",  label: "Fund Expense Ratio %",     type: "percent",  defaultValue: 0.75,  min: 0, max: 5, helpText: "Actively managed funds often 0.5–1.5%; index funds often 0.03–0.20%" },
    { name: "alternativeExpenseRatioPct", label: "Alternative Fund Expense Ratio %", type: "percent", defaultValue: 0.05, min: 0, max: 5, helpText: "A comparable low-cost index fund" },
    { name: "expectedReturnPct",label: "Expected Gross Annual Return %", type: "percent", defaultValue: 8, min: 0, max: 30 },
    { name: "years",            label: "Years Invested",           type: "number",   defaultValue: 25,    min: 1, max: 60 },
  ],
  outputs: [
    { key: "endingValueHighFee", label: "Ending Value (Higher-Fee Fund)", format: "currency" },
    { key: "endingValueLowFee",  label: "Ending Value (Low-Fee Fund)",    format: "currency", highlight: true },
    { key: "totalFeesHighFund",  label: "Total Fees Paid (Higher-Fee)",   format: "currency" },
    { key: "totalFeesLowFund",   label: "Total Fees Paid (Low-Fee)",      format: "currency" },
    { key: "dollarDifference",   label: "Dollars Lost to Higher Fees",    format: "currency", highlight: true },
    { key: "percentDifference",  label: "% Less Ending Value",            format: "percent",  highlight: true },
  ],
  chartKeys: ["endingValueHighFee", "endingValueLowFee"],
  compute(v) {
    function project(netReturnPct: number, grossReturnPct: number) {
      let balance = v.investmentAmount;
      let totalFees = 0;
      const monthlyNetRate = netReturnPct / 100 / 12;
      const monthlyGrossRate = grossReturnPct / 100 / 12;
      const months = v.years * 12;
      for (let i = 0; i < months; i++) {
        const grossGrowth = balance * monthlyGrossRate;
        const feeThisMonth = balance * (monthlyGrossRate - monthlyNetRate);
        totalFees += feeThisMonth;
        balance = balance * (1 + monthlyNetRate) + v.monthlyContribution;
      }
      return { balance, totalFees };
    }
    const highNet = v.expectedReturnPct - v.expenseRatioPct;
    const lowNet = v.expectedReturnPct - v.alternativeExpenseRatioPct;
    const high = project(highNet, v.expectedReturnPct);
    const low = project(lowNet, v.expectedReturnPct);
    const endingValueHighFee = high.balance;
    const endingValueLowFee = low.balance;
    const totalFeesHighFund = high.totalFees;
    const totalFeesLowFund = low.totalFees;
    const dollarDifference = endingValueLowFee - endingValueHighFee;
    const percentDifference = endingValueLowFee > 0 ? (dollarDifference / endingValueLowFee) * 100 : 0;
    return { endingValueHighFee, endingValueLowFee, totalFeesHighFund, totalFeesLowFund, dollarDifference, percentDifference };
  },
  seoContent: {
    intro: `A 0.75% expense ratio sounds trivial next to a 0.05% index fund — but compounded over decades, that "small" fee difference can quietly consume tens of thousands of dollars of your returns. This calculator compares two funds side by side so you can see the real, long-term dollar cost of fees.`,
    howToSteps: [
      "Enter your **initial investment** and **monthly contribution**.",
      "Enter the **expense ratio** of the fund you're considering.",
      "Enter the **expense ratio of a lower-cost alternative** (many broad index funds charge 0.03–0.10%).",
      "Set your **expected gross annual return** before fees.",
      "Choose the **number of years** you'll stay invested.",
      "Compare ending values and total dollars lost to the higher-fee fund.",
    ],
    formula: `Net Monthly Return = (Gross Return % − Expense Ratio %) ÷ 12\n\nEach fund's balance compounds monthly at its own net return, with fees calculated as the gap between gross and net growth each period`,
    workedExample: `Investment: $20,000 + $500/mo. Gross return: 8%/yr. Fund A fee: 0.75%. Fund B fee: 0.05%. 25 years.\n\nFund A net return ≈ 7.25%/yr → lower ending balance\nFund B net return ≈ 7.95%/yr → higher ending balance\nOver 25 years, the 0.70 percentage-point fee gap can cost tens of thousands of dollars in lost compounding — run the numbers with your own inputs to see the exact gap.`,
    faqs: [
      { q: "What is an expense ratio?", a: "The expense ratio is the annual fee a fund charges, expressed as a percentage of your assets, deducted automatically from the fund's returns — you never see a separate bill, but it silently reduces your net performance every year." },
      { q: "What's a reasonable expense ratio?", a: "Broad market index ETFs commonly charge 0.03–0.10%. Actively managed mutual funds often charge 0.5–1.5%+. Specialty or actively managed strategies can run even higher. Lower isn't automatically better if the fund justifies its cost with real outperformance, but most actively managed funds don't beat their benchmark after fees over the long run." },
      { q: "Why does a small fee difference matter so much over time?", a: "Fees compound negatively the same way returns compound positively — a fee taken every year reduces the base that future growth compounds on, so the gap widens every year you stay invested." },
      { q: "Do actively managed funds ever justify higher fees?", a: "Occasionally, but statistically the majority of actively managed funds underperform their low-cost index benchmark over long periods, after fees. Some investors are willing to pay for lower volatility, tax management, or a specific strategy despite this." },
      { q: "Are there other fees besides the expense ratio?", a: "Yes — watch for trading commissions, bid-ask spreads, loads (sales charges) on some mutual funds, and account/advisory fees layered on top by a broker or advisor." },
    ],
  },
};

export default config;