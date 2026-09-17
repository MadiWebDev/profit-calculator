import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "crypto-profit",
  title: "Crypto Profit & Loss Calculator",
  shortTitle: "Crypto Profit",
  description: "Calculate your crypto trading profit or loss after exchange fees, gas fees, and slippage.",
  metaDescription: "Free crypto profit calculator. Enter buy price, sell price, amount, exchange fees, and gas fees to calculate net profit, ROI %, and break-even sell price.",
  keywords: ["crypto profit calculator", "crypto pnl calculator", "bitcoin profit calculator", "crypto roi calculator", "crypto gain loss calculator"],
  icon: "🪙",
  category: "investing",
  relatedSlugs: ["crypto-staking-roi", "stock-profit", "compound-interest"],
  fields: [
    { name: "buyPrice",     label: "Buy Price (per unit)",   type: "currency", defaultValue: 30000, min: 0 },
    { name: "sellPrice",    label: "Sell Price (per unit)",  type: "currency", defaultValue: 45000, min: 0 },
    { name: "amountHeld",   label: "Amount Held",            type: "number",   defaultValue: 0.5,   min: 0, helpText: "Number of coins/tokens" },
    { name: "buyFeePct",    label: "Buy Exchange Fee %",     type: "percent",  defaultValue: 0.5,   min: 0, max: 10 },
    { name: "sellFeePct",   label: "Sell Exchange Fee %",    type: "percent",  defaultValue: 0.5,   min: 0, max: 10 },
    { name: "gasFees",      label: "Network / Gas Fees (total)", type: "currency", defaultValue: 15, min: 0 },
  ],
  outputs: [
    { key: "netProfit",         label: "Net Profit / Loss",   format: "currency", highlight: true },
    { key: "roi",                label: "ROI %",               format: "percent",  highlight: true },
    { key: "totalFeesPaid",      label: "Total Fees Paid",     format: "currency" },
    { key: "costBasis",          label: "Total Cost Basis",    format: "currency" },
    { key: "netProceeds",        label: "Net Sale Proceeds",   format: "currency" },
    { key: "breakEvenSellPrice", label: "Break-Even Sell Price", format: "currency", description: "Price needed just to cover cost + fees" },
  ],
  chartKeys: ["costBasis", "totalFeesPaid", "netProfit"],
  compute(v) {
    const buyFeeAmt = (v.buyPrice * v.amountHeld * v.buyFeePct) / 100;
    const costBasis = v.buyPrice * v.amountHeld + buyFeeAmt + v.gasFees / 2;
    const sellFeeAmt = (v.sellPrice * v.amountHeld * v.sellFeePct) / 100;
    const netProceeds = v.sellPrice * v.amountHeld - sellFeeAmt - v.gasFees / 2;
    const netProfit = netProceeds - costBasis;
    const roi = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;
    const totalFeesPaid = buyFeeAmt + sellFeeAmt + v.gasFees;
    const breakEvenSellPrice = v.amountHeld > 0 ? (costBasis + sellFeeAmt) / (v.amountHeld * (1 - v.sellFeePct / 100)) : 0;
    return { netProfit, roi, totalFeesPaid, costBasis, netProceeds, breakEvenSellPrice };
  },
  seoContent: {
    intro: `Crypto trading fees look tiny as a percentage but add up fast across buy fees, sell fees, and network gas costs — especially on smaller trades. This calculator nets out every fee to show your true profit or loss, ROI, and the exact break-even price you need to sell at just to cover your costs.`,
    howToSteps: [
      "Enter your **buy price** and **sell price** per unit (or use current price for an unrealized P&L check).",
      "Enter the **amount held** — number of coins or tokens.",
      "Add your exchange's **buy fee %** and **sell fee %**.",
      "Add any **network/gas fees** paid for on-chain transactions.",
      "Review your net profit, ROI %, and break-even sell price.",
    ],
    formula: `Cost Basis = (Buy Price × Amount) + Buy Fee + Gas Fees/2\n\nNet Proceeds = (Sell Price × Amount) − Sell Fee − Gas Fees/2\n\nNet Profit = Net Proceeds − Cost Basis`,
    workedExample: `Buy: $30,000 × 0.5 = $15,000. Sell: $45,000 × 0.5 = $22,500. Buy/sell fee: 0.5% each. Gas: $15 total.\n\nBuy Fee = 0.5% × $15,000 = $75\nCost Basis = $15,000 + $75 + $7.50 = $15,082.50\nSell Fee = 0.5% × $22,500 = $112.50\nNet Proceeds = $22,500 − $112.50 − $7.50 = $22,380\nNet Profit = $22,380 − $15,082.50 = $7,297.50\nROI = $7,297.50 ÷ $15,082.50 = 48.4%`,
    faqs: [
      { q: "Do I owe taxes on crypto profit?", a: "In most countries, selling crypto for a gain is a taxable event, often treated as a capital gain. Rules on cost basis method (FIFO, LIFO, specific ID) vary by jurisdiction — consult a tax professional for your specific situation." },
      { q: "What fees should I include in a crypto profit calculation?", a: "Exchange trading fees (maker/taker), withdrawal fees, and blockchain network/gas fees for any on-chain transfers or swaps. These are easy to overlook but meaningfully reduce net profit, especially on smaller trades." },
      { q: "What is break-even price in crypto trading?", a: "It's the exact price you'd need to sell at to recover your original cost basis plus all fees, with zero profit. Selling below it locks in a loss even if the price is above what you originally paid." },
      { q: "Do gas fees matter more on some blockchains than others?", a: "Yes significantly. Ethereum mainnet gas fees can range from a few dollars to $50+ during congestion, while networks like Solana or Polygon typically cost fractions of a cent — factor this into your trade size decisions." },
      { q: "Should I calculate profit in USD or in another crypto?", a: "Track profit in your home fiat currency for tax and real-world purchasing power purposes, even if you're trading one crypto for another — most tax authorities treat crypto-to-crypto trades as taxable events too." },
    ],
  },
};

export default config;