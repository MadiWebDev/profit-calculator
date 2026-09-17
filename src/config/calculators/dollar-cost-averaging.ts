import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "dollar-cost-averaging", 
  title: "Dollar-Cost Averaging (DCA) Return Calculator",
  shortTitle: "DCA Calculator",
  description: "Calculate your average cost basis and return from investing a fixed amount on a regular schedule.",
  metaDescription: "Free dollar-cost averaging calculator. Enter your periodic investment amount, number of periods, and price history to calculate average cost basis, total shares, and return %.",
  keywords: ["dollar cost averaging calculator", "dca calculator", "average cost basis calculator", "recurring investment calculator", "dca vs lump sum"],
  icon: "🔁",
  category: "investing",
  relatedSlugs: ["compound-interest", "stock-profit", "etf-fee-impact"],
  fields: [
    { name: "amountPerPeriod", label: "Investment per Period",   type: "currency", defaultValue: 500, min: 0 },
    { name: "numPeriods",      label: "Number of Periods",       type: "number",   defaultValue: 12,   min: 1, helpText: "e.g. 12 monthly investments" },
    { name: "startPrice",      label: "Starting Price",          type: "currency", defaultValue: 100,  min: 0 },
    { name: "endPrice",        label: "Ending / Current Price",  type: "currency", defaultValue: 130,  min: 0 },
    { name: "priceVolatilityPct", label: "Assumed Period-to-Period Volatility %", type: "percent", defaultValue: 15, min: 0, max: 100, helpText: "Used to simulate a realistic zig-zag price path between start and end" },
  ],
  outputs: [
    { key: "totalInvested",     label: "Total Invested",       format: "currency", highlight: true },
    { key: "totalShares",       label: "Total Shares Bought",  format: "number" },
    { key: "avgCostBasis",      label: "Average Cost Basis / Share", format: "currency", highlight: true },
    { key: "endingValue",       label: "Ending Value",         format: "currency", highlight: true },
    { key: "totalReturn",       label: "Total Return %",       format: "percent",  highlight: true },
    { key: "lumpSumEndingValue",label: "Lump-Sum Ending Value (comparison)", format: "currency", description: "If invested all at once at the starting price" },
  ],
  chartKeys: ["totalInvested", "endingValue", "lumpSumEndingValue"],
  compute(v) {
    // Simulate a simple deterministic zig-zag price path from start to end price using the volatility input
    const n = Math.max(1, Math.round(v.numPeriods));
    let totalShares = 0;
    const priceStep = (v.endPrice - v.startPrice) / (n - 1 || 1);
    for (let i = 0; i < n; i++) {
      const trendPrice = v.startPrice + priceStep * i;
      const oscillation = 1 + (v.priceVolatilityPct / 100) * Math.sin(i * 1.7) * 0.5;
      const periodPrice = Math.max(0.01, trendPrice * oscillation);
      totalShares += v.amountPerPeriod / periodPrice;
    }
    const totalInvested = v.amountPerPeriod * n;
    const avgCostBasis = totalShares > 0 ? totalInvested / totalShares : 0;
    const endingValue = totalShares * v.endPrice;
    const totalReturn = totalInvested > 0 ? ((endingValue - totalInvested) / totalInvested) * 100 : 0;
    const lumpSumShares = v.startPrice > 0 ? totalInvested / v.startPrice : 0;
    const lumpSumEndingValue = lumpSumShares * v.endPrice;
    return { totalInvested, totalShares, avgCostBasis, endingValue, totalReturn, lumpSumEndingValue };
  },
  seoContent: {
    intro: `Dollar-cost averaging (DCA) means investing a fixed amount on a regular schedule regardless of price — buying more shares when prices dip and fewer when they rise, which smooths out your average cost basis. This calculator simulates a realistic price path between your start and end price to estimate shares bought, average cost, and total return versus investing it all at once.`,
    howToSteps: [
      "Enter the **amount you invest each period** (e.g. monthly).",
      "Enter the **number of periods** you plan to invest for.",
      "Enter the **starting price** and **ending/current price** of the asset.",
      "Set an assumed **volatility %** to simulate realistic price swings between the start and end.",
      "Compare your DCA results to a lump-sum investment made all at once at the starting price.",
    ],
    formula: `Shares Bought Each Period = Investment Amount ÷ Price That Period\n\nAverage Cost Basis = Total Invested ÷ Total Shares\n\nTotal Return = (Ending Value − Total Invested) ÷ Total Invested × 100`,
    workedExample: `$500/month for 12 months. Price moves from $100 to $130 with 15% volatility along the way.\n\nTotal Invested = $500 × 12 = $6,000\nShares bought vary with each period's simulated price, netting a total share count with an average cost basis typically somewhat below the straight-line midpoint of $115 due to buying more shares on down-swings.\nEnding Value = Total Shares × $130 — usually within a few percent of the lump-sum result over a rising trend, with DCA offering a smoother ride if it fell first.`,
    faqs: [
      { q: "Is DCA better than investing a lump sum?", a: "Historically, lump-sum investing outperforms DCA more often than not in markets that trend upward over time, simply because more money is invested (and compounding) sooner. DCA's real advantage is behavioral and risk-management — it reduces the regret and risk of investing a large sum right before a downturn." },
      { q: "When does DCA work best?", a: "DCA tends to help most in volatile or declining markets, where buying at a lower average price beats a lump sum invested at a single, possibly higher, starting point. In steadily rising markets, lump sum usually wins." },
      { q: "How does DCA lower my average cost basis?", a: "Because you invest a fixed dollar amount each period, you automatically buy more shares when the price is low and fewer when it's high — mathematically pulling your average cost per share below the simple average of the prices themselves." },
      { q: "Should I DCA into a single stock or a diversified fund?", a: "DCA reduces timing risk but not asset-specific risk — pairing it with a diversified index fund addresses both the 'when to invest' question and the 'what to invest in' question simultaneously." },
      { q: "How long should a DCA plan run?", a: "There's no fixed rule — many investors simply DCA continuously with every paycheck rather than treating it as a fixed-length plan. If deploying a lump sum you're nervous about investing all at once, 6–12 months is a common DCA-in period." },
    ],
  },
};

export default config;