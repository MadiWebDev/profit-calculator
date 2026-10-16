import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "house-flipping-profit",
  title: "House Flipping Profit Calculator",
  shortTitle: "House Flipping Profit",
  description: "Calculate your profit, ROI, and max allowable offer on a house flip after renovation and selling costs.",
  metaDescription: "Free house flipping profit calculator. Enter purchase price, renovation budget, holding costs, and ARV to calculate net profit, ROI, and the 70% rule max offer.",
  keywords: ["house flipping calculator", "fix and flip calculator", "real estate flip profit calculator", "70 percent rule calculator", "flip roi calculator"],
  icon: "🔨",
  category: "real-estate",
  relatedSlugs: ["rental-property-roi", "cap-rate", "mortgage-affordability"],
  fields: [
    { name: "purchasePrice",   label: "Purchase Price",          type: "currency", defaultValue: 180000, min: 0 },
    { name: "arv",             label: "After Repair Value (ARV)",type: "currency", defaultValue: 300000, min: 0 },
    { name: "renovationCost",  label: "Renovation Budget",       type: "currency", defaultValue: 45000,  min: 0 },
    { name: "closingCostsBuy", label: "Closing Costs (Buy)",     type: "currency", defaultValue: 3600,   min: 0 },
    { name: "holdingCostsMonthly", label: "Holding Costs / Month", type: "currency", defaultValue: 1200, min: 0, helpText: "Loan interest, taxes, insurance, utilities while renovating" },
    { name: "holdingMonths",   label: "Holding Period (months)", type: "number",   defaultValue: 4,      min: 0 },
    { name: "sellingCostsPct", label: "Selling Costs %",         type: "percent",  defaultValue: 8,      min: 0, max: 20, helpText: "Agent commission + closing costs on sale, typically 6–10%" },
  ],
  outputs: [
    { key: "netProfit",       label: "Net Profit",            format: "currency", highlight: true },
    { key: "roi",             label: "ROI %",                 format: "percent",  highlight: true },
    { key: "totalInvestment", label: "Total Cash Invested",   format: "currency" },
    { key: "sellingCosts",    label: "Selling Costs",         format: "currency" },
    { key: "totalHoldingCosts", label: "Total Holding Costs", format: "currency" },
    { key: "maxOfferSeventyRule", label: "Max Offer (70% Rule)", format: "currency", highlight: true, description: "ARV × 70% − Renovation Cost" },
    { key: "profitMargin",    label: "Profit Margin % of ARV", format: "percent" },
    { key: "netProceeds",     label: "Net Sale Proceeds",     format: "currency" },
  ],
  chartKeys: ["purchasePrice", "renovationCost", "totalHoldingCosts", "sellingCosts", "netProfit"],
  compute(v) {
    const totalHoldingCosts = v.holdingCostsMonthly * v.holdingMonths;
    const sellingCosts = (v.arv * v.sellingCostsPct) / 100;
    const netProceeds = v.arv - sellingCosts;
    const totalInvestment = v.purchasePrice + v.renovationCost + v.closingCostsBuy + totalHoldingCosts;
    const netProfit = netProceeds - totalInvestment;
    const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
    const profitMargin = v.arv > 0 ? (netProfit / v.arv) * 100 : 0;
    const maxOfferSeventyRule = v.arv * 0.7 - v.renovationCost;
    return { netProfit, roi, totalInvestment, sellingCosts, totalHoldingCosts, maxOfferSeventyRule, profitMargin, netProceeds };
  },
  seoContent: {
    intro: `Flipping houses is a numbers game — the margin between what you pay, what you spend renovating, and what the house actually sells for can be razor thin once financing costs and agent commissions eat into your proceeds. This calculator gives you net profit, ROI, and the classic 70% Rule max offer so you know your walk-away price before you bid.`,
    howToSteps: [
      "Enter the **purchase price** of the property.",
      "Enter the **After Repair Value (ARV)** — what the home will sell for once renovated, based on comps.",
      "Add your **renovation budget** — get contractor quotes, then add a 10–15% contingency.",
      "Add **closing costs** on the purchase.",
      "Enter **monthly holding costs** — loan interest, taxes, insurance, utilities during the renovation.",
      "Enter your expected **holding period** in months.",
      "Set **selling costs %** — typically 6–10% for agent commission and closing costs.",
      "Compare your numbers to the 70% Rule max offer to sanity-check the deal.",
    ],
    formula: `Total Investment = Purchase Price + Renovation Cost + Buy Closing Costs + Holding Costs\n\nNet Proceeds = ARV − Selling Costs\n\nNet Profit = Net Proceeds − Total Investment\n\n70% Rule Max Offer = (ARV × 70%) − Renovation Cost`,
    workedExample: `Purchase: $180,000. ARV: $300,000. Renovation: $45,000. Buy closing: $3,600. Holding: $1,200 × 4 = $4,800. Selling costs: 8%.\n\nTotal Investment = $180,000 + $45,000 + $3,600 + $4,800 = $233,400\nSelling Costs = 8% × $300,000 = $24,000\nNet Proceeds = $300,000 − $24,000 = $276,000\nNet Profit = $276,000 − $233,400 = $42,600\nROI = $42,600 ÷ $233,400 = 18.3%`,
    faqs: [
      { q: "What is the 70% Rule in house flipping?", a: "The 70% Rule says you shouldn't pay more than 70% of the ARV minus renovation costs. It builds in a margin for holding costs, selling costs, and profit, and is a fast sanity check before deep-diving into a deal." },
      { q: "What is a good ROI for a house flip?", a: "Many flippers target 15–20%+ ROI (or a flat profit of $20,000–$30,000+ per deal) to account for the time, risk, and capital tied up. Deals below 10% ROI often aren't worth the effort and risk of a renovation gone wrong." },
      { q: "What holding costs should I include in a flip?", a: "Hard money or bridge loan interest, property taxes, insurance, utilities, and any HOA dues during the renovation and marketing period. Underestimating the timeline is the #1 way flippers blow their budget." },
      { q: "How accurate does my ARV estimate need to be?", a: "Very. Pull at least 3–5 closed comparable sales within the last 6 months and a similar radius, adjusted for square footage and condition. An inflated ARV is the most common cause of a flip losing money." },
      { q: "Should I include my own labor in renovation costs?", a: "If you're doing work yourself, still price it at market labor rates to know your true profit — otherwise you're paying yourself in unpaid hours instead of real ROI." },
    ],
  },
};

export default config;