import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "food-cost-percentage",
  title: "Food Cost Percentage Calculator",
  shortTitle: "Food Cost %", 
  description: "Calculate the food cost percentage and ideal menu price for any dish based on your ingredient costs.",
  metaDescription: "Free food cost percentage calculator. Enter ingredient cost and menu price to calculate food cost %, gross profit per dish, and the ideal menu price for your target margin.",
  keywords: ["food cost percentage calculator", "food cost calculator", "menu item cost calculator", "recipe cost calculator", "ideal food cost calculator"],
  icon: "🥘",
  category: "restaurant",
  relatedSlugs: ["restaurant-profit-margin", "menu-price", "profit-margin"],
  fields: [
    { name: "ingredientCost",  label: "Total Ingredient Cost (per dish)", type: "currency", defaultValue: 4.50, min: 0 },
    { name: "menuPrice",       label: "Current Menu Price",      type: "currency", defaultValue: 16,   min: 0 },
    { name: "targetFoodCostPct", label: "Target Food Cost %",    type: "percent",  defaultValue: 30,   min: 5, max: 60 },
    { name: "unitsSoldMonthly", label: "Units Sold / Month",     type: "number",   defaultValue: 400,  min: 0 },
  ],
  outputs: [
    { key: "actualFoodCostPct",  label: "Actual Food Cost %",    format: "percent", highlight: true },
    { key: "grossProfitPerDish", label: "Gross Profit per Dish", format: "currency", highlight: true },
    { key: "idealMenuPrice",     label: "Ideal Menu Price (at target %)", format: "currency", highlight: true },
    { key: "priceGapToTarget",   label: "Price Gap to Target",   format: "currency", description: "How much to raise/lower price to hit target food cost %" },
    { key: "monthlyGrossProfit", label: "Monthly Gross Profit (this dish)", format: "currency" },
  ],
  chartKeys: ["ingredientCost", "grossProfitPerDish"],
  compute(v) {
    const actualFoodCostPct = v.menuPrice > 0 ? (v.ingredientCost / v.menuPrice) * 100 : 0;
    const grossProfitPerDish = v.menuPrice - v.ingredientCost;
    const idealMenuPrice = v.targetFoodCostPct > 0 ? v.ingredientCost / (v.targetFoodCostPct / 100) : 0;
    const priceGapToTarget = idealMenuPrice - v.menuPrice;
    const monthlyGrossProfit = grossProfitPerDish * v.unitsSoldMonthly;
    return { actualFoodCostPct, grossProfitPerDish, idealMenuPrice, priceGapToTarget, monthlyGrossProfit };
  },
  seoContent: {
    intro: `Every dish on your menu has its own food cost percentage, and averaging across the whole menu can hide items that are quietly losing money. This calculator checks a single dish's food cost % against your target, and tells you the exact price needed to hit that target — or how much gross profit you're leaving on the table at the current price.`,
    howToSteps: [
      "Enter the **total ingredient cost** for one serving of the dish (from your recipe costing sheet).",
      "Enter the dish's **current menu price**.",
      "Set your **target food cost %** — most restaurants aim for 28–35%.",
      "Enter **units sold per month** to see the total monthly gross profit impact.",
      "Review actual food cost %, gross profit per dish, and the ideal price to hit your target.",
    ],
    formula: `Food Cost % = (Ingredient Cost ÷ Menu Price) × 100\n\nIdeal Menu Price = Ingredient Cost ÷ Target Food Cost %\n\nGross Profit per Dish = Menu Price − Ingredient Cost`,
    workedExample: `Ingredient cost: $4.50. Menu price: $16. Target food cost: 30%. Units sold: 400/month.\n\nActual Food Cost % = $4.50 ÷ $16 = 28.1% (already below target — healthy)\nGross Profit per Dish = $16 − $4.50 = $11.50\nIdeal Price at 30% Target = $4.50 ÷ 30% = $15.00 (current price is already fine)\nMonthly Gross Profit = $11.50 × 400 = $4,600`,
    faqs: [
      { q: "What is a good food cost percentage?", a: "Most full-service restaurants target 28–35% food cost overall, though individual dishes can range widely — high-ticket protein dishes often run higher food cost %, while pasta, rice, and vegetable-forward dishes run lower, balancing the menu average." },
      { q: "Should every dish hit the same target food cost %?", a: "No — many restaurants intentionally price some 'anchor' dishes (like a popular steak) at a higher food cost % to drive traffic, while pricing sides, appetizers, and beverages at a lower food cost % to balance the overall menu margin." },
      { q: "What should be included in ingredient cost?", a: "The cost of every ingredient in the exact recipe quantity used per serving, including garnishes, sauces, and any 'free' accompaniments like bread or condiments that are actually served with the dish." },
      { q: "How often should I recalculate food cost?", a: "Whenever ingredient prices shift meaningfully (which can happen often with volatile commodities like proteins, dairy, or produce) — many restaurants recheck core menu items quarterly at minimum, or monthly for high-volatility ingredients." },
      { q: "Does raising menu price always improve food cost %?", a: "Yes mathematically, but price increases can affect sales volume — a smarter first step is often reducing portion waste, renegotiating supplier pricing, or reformulating the recipe before raising customer-facing prices." },
    ],
  },
};

export default config;