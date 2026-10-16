import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "restaurant-profit-margin",
  title: "Restaurant Profit Margin Calculator",
  shortTitle: "Restaurant Profit Margin",
  description: "Calculate your restaurant's net profit margin after food cost, labor cost, and overhead.",
  metaDescription: "Free restaurant profit margin calculator. Enter monthly revenue, food cost, labor cost, and overhead to calculate prime cost, net margin, and break-even revenue.",
  keywords: ["restaurant profit margin calculator", "restaurant profitability calculator", "prime cost calculator", "restaurant profit calculator"],
  icon: "🍽️",
  category: "restaurant",
  relatedSlugs: ["food-cost-percentage", "menu-price", "profit-margin"],
  fields: [
    { name: "monthlyRevenue",  label: "Monthly Revenue",         type: "currency", defaultValue: 90000, min: 0 },
    { name: "foodCost",        label: "Monthly Food/Beverage Cost", type: "currency", defaultValue: 27000, min: 0 },
    { name: "laborCost",       label: "Monthly Labor Cost",      type: "currency", defaultValue: 29000, min: 0, helpText: "Wages + payroll taxes + benefits" },
    { name: "rent",            label: "Monthly Rent",            type: "currency", defaultValue: 8000,  min: 0 },
    { name: "otherOverhead",   label: "Other Monthly Overhead",  type: "currency", defaultValue: 9000,  min: 0, helpText: "Utilities, insurance, marketing, supplies, POS fees" },
  ],
  outputs: [
    { key: "foodCostPct",      label: "Food Cost %",             format: "percent" },
    { key: "laborCostPct",     label: "Labor Cost %",            format: "percent" },
    { key: "primeCost",        label: "Prime Cost",              format: "currency", highlight: true, description: "Food cost + labor cost combined" },
    { key: "primeCostPct",     label: "Prime Cost %",            format: "percent",  highlight: true, description: "Should generally be below 60–65%" },
    { key: "netProfit",        label: "Net Profit",              format: "currency", highlight: true },
    { key: "netMargin",        label: "Net Margin %",            format: "percent",  highlight: true },
    { key: "breakEvenRevenue", label: "Break-Even Revenue",      format: "currency" },
  ],
  chartKeys: ["foodCost", "laborCost", "rent", "otherOverhead", "netProfit"],
  compute(v) {
    const foodCostPct = v.monthlyRevenue > 0 ? (v.foodCost / v.monthlyRevenue) * 100 : 0;
    const laborCostPct = v.monthlyRevenue > 0 ? (v.laborCost / v.monthlyRevenue) * 100 : 0;
    const primeCost = v.foodCost + v.laborCost;
    const primeCostPct = v.monthlyRevenue > 0 ? (primeCost / v.monthlyRevenue) * 100 : 0;
    const totalCosts = primeCost + v.rent + v.otherOverhead;
    const netProfit = v.monthlyRevenue - totalCosts;
    const netMargin = v.monthlyRevenue > 0 ? (netProfit / v.monthlyRevenue) * 100 : 0;
    const variableCostRatio = v.monthlyRevenue > 0 ? (v.foodCost) / v.monthlyRevenue : 0;
    const fixedCosts = v.rent + v.otherOverhead + v.laborCost * 0.5; // assume half of labor is semi-fixed base staffing
    const contributionRatio = 1 - variableCostRatio;
    const breakEvenRevenue = contributionRatio > 0 ? fixedCosts / contributionRatio : 0;
    return { foodCostPct, laborCostPct, primeCost, primeCostPct, netProfit, netMargin, breakEvenRevenue };
  },
  seoContent: {
    intro: `Restaurants run on razor-thin margins, and prime cost — food cost plus labor cost combined — is the single number that determines whether you're actually profitable. This calculator computes your food cost %, labor cost %, prime cost %, and bottom-line net margin so you can spot problems before they show up in your bank balance.`,
    howToSteps: [
      "Enter your **monthly revenue**.",
      "Enter your **monthly food and beverage cost**.",
      "Enter your **monthly labor cost**, including payroll taxes and benefits.",
      "Enter your **monthly rent**.",
      "Add **other overhead** — utilities, insurance, marketing, supplies, POS fees.",
      "Review food cost %, labor cost %, prime cost %, and net margin.",
    ],
    formula: `Prime Cost = Food Cost + Labor Cost\n\nPrime Cost % = (Prime Cost ÷ Revenue) × 100\n\nNet Profit = Revenue − Food Cost − Labor Cost − Rent − Other Overhead`,
    workedExample: `Revenue: $90,000. Food cost: $27,000. Labor: $29,000. Rent: $8,000. Overhead: $9,000.\n\nFood Cost % = $27,000 ÷ $90,000 = 30%\nLabor Cost % = $29,000 ÷ $90,000 = 32.2%\nPrime Cost = $27,000 + $29,000 = $56,000 (62.2% of revenue)\nNet Profit = $90,000 − $56,000 − $8,000 − $9,000 = $17,000\nNet Margin = $17,000 ÷ $90,000 = 18.9%`,
    faqs: [
      { q: "What is a good prime cost percentage for a restaurant?", a: "Most successful restaurants target a prime cost of 55–65% of revenue. Full-service restaurants often run closer to 60–65%, while quick-service can run lower given less labor intensity per order." },
      { q: "What is a healthy food cost percentage?", a: "Most restaurants target 28–35% food cost, varying by concept — steakhouses tend to run higher due to expensive proteins, while pizza and pasta concepts can run lower given cheaper core ingredients." },
      { q: "What is a healthy labor cost percentage?", a: "Typically 25–35% of revenue, though full-service restaurants with table service tend to run higher than quick-service or fast-casual concepts with leaner staffing models." },
      { q: "What's a good net profit margin for a restaurant?", a: "Restaurant net margins are notoriously thin — 3–9% is typical for full-service restaurants, with well-run quick-service or fast-casual concepts sometimes reaching 10–15%." },
      { q: "How can I lower my prime cost?", a: "Renegotiate supplier contracts, reduce food waste through better portion control and inventory management, optimize your menu toward higher-margin items, and build smarter staff scheduling matched to actual demand patterns." },
    ],
  },
};

export default config;