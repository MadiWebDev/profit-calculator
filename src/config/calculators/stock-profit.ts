import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "stock-profit",
  title: "Stock Profit & Return Calculator",
  shortTitle: "Stock Profit",
  description: "Calculate your stock investment profit, return %, and annualized return after fees and dividends.",
  metaDescription: "Free stock profit calculator. Enter buy price, sell price, shares, fees, and dividends to calculate net profit, ROI %, and annualized return.",
  keywords: ["stock profit calculator", "stock return calculator", "stock investment calculator", "annualized return calculator", "capital gains calculator stocks"],
  icon: "📈",
  category: "investing",
  relatedSlugs: ["dividend-yield", "compound-interest", "dollar-cost-averaging"],
  fields: [
    { name: "buyPrice",      label: "Buy Price per Share",    type: "currency", defaultValue: 50,   min: 0 },
    { name: "sellPrice",     label: "Sell Price per Share",   type: "currency", defaultValue: 68,   min: 0 },
    { name: "shares",        label: "Number of Shares",       type: "number",   defaultValue: 100,  min: 0 },
    { name: "dividendsReceived", label: "Total Dividends Received", type: "currency", defaultValue: 120, min: 0 },
    { name: "buyFees",       label: "Buy Commission / Fees",  type: "currency", defaultValue: 0,    min: 0 },
    { name: "sellFees",      label: "Sell Commission / Fees", type: "currency", defaultValue: 0,    min: 0 },
    { name: "holdingMonths", label: "Holding Period (months)",type: "number",   defaultValue: 18,   min: 0 },
  ],
  outputs: [
    { key: "netProfit",         label: "Net Profit",            format: "currency", highlight: true },
    { key: "totalReturnPct",    label: "Total Return %",        format: "percent",  highlight: true },
    { key: "annualizedReturnPct", label: "Annualized Return %", format: "percent",  highlight: true },
    { key: "costBasis",         label: "Total Cost Basis",      format: "currency" },
    { key: "saleProceeds",      label: "Net Sale Proceeds",     format: "currency" },
    { key: "capitalGain",       label: "Capital Gain (excl. dividends)", format: "currency" },
  ],
  chartKeys: ["costBasis", "capitalGain", "dividendsReceived"],
  compute(v) {
    const costBasis = v.buyPrice * v.shares + v.buyFees;
    const saleProceeds = v.sellPrice * v.shares - v.sellFees;
    const capitalGain = saleProceeds - costBasis;
    const netProfit = capitalGain + v.dividendsReceived;
    const totalReturnPct = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;
    const years = v.holdingMonths / 12;
    const annualizedReturnPct = years > 0 && costBasis > 0
      ? (Math.pow((costBasis + netProfit) / costBasis, 1 / years) - 1) * 100
      : totalReturnPct;
    return { netProfit, totalReturnPct, annualizedReturnPct, costBasis, saleProceeds, capitalGain };
  },
  seoContent: {
    intro: `Your stock's headline price gain isn't your real return — commissions, and especially the time value of money, change the picture. This calculator computes your net profit including dividends and fees, then annualizes the return so you can compare this investment fairly against other opportunities regardless of how long you held it.`,
    howToSteps: [
      "Enter your **buy price per share** and **sell price per share**.",
      "Enter the **number of shares** you held.",
      "Add any **dividends received** during the holding period.",
      "Enter **buy and sell commissions/fees**, if your broker charges them.",
      "Enter your **holding period in months** to see an annualized return.",
      "Review net profit, total return %, and annualized return %.",
    ],
    formula: `Cost Basis = (Buy Price × Shares) + Buy Fees\n\nSale Proceeds = (Sell Price × Shares) − Sell Fees\n\nNet Profit = (Sale Proceeds − Cost Basis) + Dividends\n\nAnnualized Return = [(1 + Total Return)^(1/Years) − 1] × 100`,
    workedExample: `Buy: $50 × 100 shares = $5,000. Sell: $68 × 100 shares = $6,800. Dividends: $120. Held 18 months.\n\nCapital Gain = $6,800 − $5,000 = $1,800\nNet Profit = $1,800 + $120 = $1,920\nTotal Return = $1,920 ÷ $5,000 = 38.4%\nAnnualized Return = (1.384)^(12/18) − 1 = 23.9%`,
    faqs: [
      { q: "What is annualized return and why does it matter?", a: "Annualized return converts a total gain over any holding period into an equivalent yearly rate, making it possible to fairly compare a stock held for 6 months against one held for 5 years." },
      { q: "Should I include dividends in my stock return calculation?", a: "Yes — dividends are part of your total return, not just price appreciation. Ignoring them understates your real performance, especially for dividend-focused stocks held long term." },
      { q: "How are stock capital gains taxed?", a: "In the US, gains on shares held over a year are typically taxed at long-term capital gains rates (0/15/20% depending on income); shares held a year or less are taxed as ordinary income at short-term rates. Consult a tax professional for your specific situation." },
      { q: "What's a good annualized stock return?", a: "The S&P 500 has historically returned roughly 10% annualized before inflation over long periods. Individual stock returns vary widely — compare your annualized return to a broad market benchmark over the same period for context." },
      { q: "Does this account for taxes?", a: "No — this calculator shows pre-tax profit and return. Actual after-tax return will be lower depending on your holding period and tax bracket." },
    ],
  },
};

export default config;