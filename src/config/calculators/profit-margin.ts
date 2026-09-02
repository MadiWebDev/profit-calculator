import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "profit-margin",
  title: "Business Profit Margin Calculator",
  shortTitle: "Profit Margin",
  description: "Calculate gross profit margin, net profit margin, and markup % for any business.",
  metaDescription: "Free business profit margin calculator. Enter revenue, cost of goods sold, and operating expenses to calculate gross margin, net margin, and markup percentage instantly.",
  keywords: ["profit margin calculator", "gross margin calculator", "net profit margin calculator", "markup calculator", "business profit calculator"],
  icon: "📊",
  category: "general",
  relatedSlugs: ["shopify-profit", "freelancer-profit", "dropshipping-profit"],
  fields: [
    { name: "revenue",        label: "Total Revenue",             type: "currency", defaultValue: 50000, min: 0, helpText: "Total sales revenue for the period" },
    { name: "cogs",           label: "Cost of Goods Sold (COGS)", type: "currency", defaultValue: 20000, min: 0, helpText: "Direct costs: materials, manufacturing, inventory" },
    { name: "operatingExp",   label: "Operating Expenses",        type: "currency", defaultValue: 12000, min: 0, helpText: "Rent, salaries, marketing, utilities, SG&A" },
    { name: "otherIncome",    label: "Other Income",              type: "currency", defaultValue: 0,     min: 0, helpText: "Non-operating income, interest income, etc." },
    { name: "interestTax",    label: "Interest & Tax",            type: "currency", defaultValue: 3000,  min: 0, helpText: "Interest on loans + income tax for the period" },
  ],
  outputs: [
    { key: "grossProfit",      label: "Gross Profit",            format: "currency", highlight: true },
    { key: "grossMargin",      label: "Gross Margin %",          format: "percent",  highlight: true },
    { key: "operatingProfit",  label: "Operating Profit (EBIT)", format: "currency" },
    { key: "operatingMargin",  label: "Operating Margin %",      format: "percent" },
    { key: "netProfit",        label: "Net Profit",              format: "currency", highlight: true },
    { key: "netMargin",        label: "Net Margin %",            format: "percent",  highlight: true },
    { key: "markup",           label: "Markup %",                format: "percent", description: "Gross profit as % of COGS" },
    { key: "breakEvenRevenue", label: "Break-Even Revenue",      format: "currency", description: "Revenue needed to cover all costs" },
  ],
  chartKeys: ["cogs", "operatingExp", "interestTax", "netProfit"],
  compute(v) {
    const grossProfit = v.revenue - v.cogs;
    const grossMargin = v.revenue > 0 ? (grossProfit / v.revenue) * 100 : 0;
    const operatingProfit = grossProfit - v.operatingExp + v.otherIncome;
    const operatingMargin = v.revenue > 0 ? (operatingProfit / v.revenue) * 100 : 0;
    const netProfit = operatingProfit - v.interestTax;
    const netMargin = v.revenue > 0 ? (netProfit / v.revenue) * 100 : 0;
    const markup = v.cogs > 0 ? (grossProfit / v.cogs) * 100 : 0;
    const fixedCosts = v.operatingExp + v.interestTax;
    const contribMarginRatio = v.revenue > 0 ? (v.revenue - v.cogs) / v.revenue : 0;
    const breakEvenRevenue = contribMarginRatio > 0 ? fixedCosts / contribMarginRatio : 0;
    return { grossProfit, grossMargin, operatingProfit, operatingMargin, netProfit, netMargin, markup, breakEvenRevenue, cogs: v.cogs, operatingExp: v.operatingExp, interestTax: v.interestTax };
  },
  seoContent: {
    intro: `Profit margin is the single most important indicator of business health. It tells you what percentage of every revenue dollar you actually keep as profit. Whether you're a small business owner reviewing quarterly performance, an ecommerce seller analyzing product lines, or a founder pitching investors, understanding your gross margin, operating margin, and net margin is non-negotiable. This calculator handles all three in seconds.`,
    howToSteps: [
      "Enter your **total revenue** — all sales income for the period.",
      "Enter your **cost of goods sold (COGS)** — direct costs: product, materials, manufacturing.",
      "Add your **operating expenses** — rent, salaries, marketing, admin, utilities.",
      "Add any **other income** such as interest income or non-operating revenue.",
      "Add **interest and tax** to calculate your bottom-line net profit.",
      "Review gross margin, operating margin, net margin, markup %, and break-even revenue.",
    ],
    formula: `Gross Profit = Revenue − COGS\nGross Margin % = (Gross Profit ÷ Revenue) × 100\nOperating Profit = Gross Profit − Operating Expenses\nNet Profit = Operating Profit − Interest & Tax\nNet Margin % = (Net Profit ÷ Revenue) × 100\nMarkup % = (Gross Profit ÷ COGS) × 100`,
    workedExample: `Revenue: $50,000. COGS: $20,000. Operating Expenses: $12,000. Tax: $3,000.\n\nGross Profit = $50,000 − $20,000 = $30,000\nGross Margin = ($30,000 ÷ $50,000) × 100 = 60%\nOperating Profit = $30,000 − $12,000 = $18,000\nNet Profit = $18,000 − $3,000 = $15,000\nNet Margin = ($15,000 ÷ $50,000) × 100 = 30%\nMarkup = ($30,000 ÷ $20,000) × 100 = 150%`,
    faqs: [
      { q: "What is a good profit margin for a small business?", a: "It varies by industry: retail averages 2–5% net margin, SaaS companies often achieve 20–40%, and service businesses 10–20%. Generally, a net margin above 10% is considered healthy. Compare to industry benchmarks rather than absolute numbers." },
      { q: "What is the difference between gross margin and net margin?", a: "Gross margin only subtracts the direct cost of goods sold from revenue. Net margin subtracts all costs — COGS, operating expenses, interest, and taxes. Net margin is your true bottom-line profitability." },
      { q: "What is markup vs margin?", a: "Markup is profit expressed as a percentage of cost: (Profit ÷ Cost) × 100. Margin is profit expressed as a percentage of revenue: (Profit ÷ Revenue) × 100. A 50% markup equals 33% margin. They measure the same profit differently." },
      { q: "How do I improve profit margin?", a: "Improve margins by: increasing prices (even 5–10% can dramatically improve profit), reducing COGS through better supplier negotiation, cutting underperforming operating expenses, improving conversion rates to spread fixed costs over more revenue, and focusing on higher-margin products." },
      { q: "What is break-even revenue?", a: "Break-even revenue is the minimum sales volume needed to cover all fixed and variable costs with zero profit. Calculate it as: Fixed Costs ÷ Gross Margin %. Knowing your break-even helps set realistic sales targets." },
    ],
  },
};

export default config;
