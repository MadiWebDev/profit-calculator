import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "menu-price",
  title: "Menu Pricing Calculator",
  shortTitle: "Menu Pricing",
  description: "Calculate the ideal menu price for a dish based on ingredient cost, target food cost %, and overhead allocation.",
  metaDescription: "Free menu pricing calculator. Enter ingredient cost, target food cost %, and overhead per dish to calculate the ideal menu price and expected profit per plate.",
  keywords: ["menu pricing calculator", "restaurant menu price calculator", "how to price a menu item", "plate cost calculator"],
  icon: "📋",
  category: "restaurant",
  relatedSlugs: ["food-cost-percentage", "restaurant-profit-margin", "profit-margin"],
  fields: [
    { name: "ingredientCost",   label: "Ingredient Cost (per plate)", type: "currency", defaultValue: 5.00, min: 0 },
    { name: "targetFoodCostPct",label: "Target Food Cost %",     type: "percent",  defaultValue: 30,   min: 5, max: 60 },
    { name: "overheadPerPlate", label: "Overhead Allocation / Plate", type: "currency", defaultValue: 2.00, min: 0, helpText: "Labor, rent, utilities allocated per dish sold" },
    { name: "desiredProfitPerPlate", label: "Desired Profit / Plate", type: "currency", defaultValue: 3.00, min: 0 },
    { name: "competitorPrice",  label: "Typical Competitor Price", type: "currency", defaultValue: 17,   min: 0, helpText: "For a market-price sanity check" },
  ],
  outputs: [
    { key: "priceFromFoodCostTarget", label: "Price from Food Cost Target", format: "currency", highlight: true },
    { key: "priceFromFullCostPlusProfit", label: "Price from Full Cost + Profit", format: "currency", highlight: true },
    { key: "recommendedPrice",  label: "Recommended Price",       format: "currency", highlight: true, description: "Higher of the two cost-based prices" },
    { key: "impliedFoodCostPctAtCompetitorPrice", label: "Food Cost % if Priced at Competitor Rate", format: "percent" },
    { key: "profitAtRecommendedPrice", label: "Profit per Plate at Recommended Price", format: "currency" },
  ],
  chartKeys: ["ingredientCost", "overheadPerPlate", "desiredProfitPerPlate"],
  compute(v) {
    const priceFromFoodCostTarget = v.targetFoodCostPct > 0 ? v.ingredientCost / (v.targetFoodCostPct / 100) : 0;
    const priceFromFullCostPlusProfit = v.ingredientCost + v.overheadPerPlate + v.desiredProfitPerPlate;
    const recommendedPrice = Math.max(priceFromFoodCostTarget, priceFromFullCostPlusProfit);
    const impliedFoodCostPctAtCompetitorPrice = v.competitorPrice > 0 ? (v.ingredientCost / v.competitorPrice) * 100 : 0;
    const profitAtRecommendedPrice = recommendedPrice - v.ingredientCost - v.overheadPerPlate;
    return { priceFromFoodCostTarget, priceFromFullCostPlusProfit, recommendedPrice, impliedFoodCostPctAtCompetitorPrice, profitAtRecommendedPrice };
  },
  seoContent: {
    intro: `Pricing a menu item well means balancing two different math checks — hitting your target food cost percentage, and covering full cost (ingredients + overhead) plus your desired profit — then sanity-checking the result against what the market will actually bear. This calculator runs both pricing methods side by side.`,
    howToSteps: [
      "Enter the **ingredient cost** for one plate.",
      "Set your **target food cost %**.",
      "Enter an **overhead allocation per plate** — a rough per-dish share of labor, rent, and utilities.",
      "Enter your **desired profit per plate**.",
      "Add a **typical competitor price** for the same or similar dish as a market sanity check.",
      "Compare the two pricing methods and pick the recommended price.",
    ],
    formula: `Price from Food Cost Target = Ingredient Cost ÷ Target Food Cost %\n\nPrice from Full Cost + Profit = Ingredient Cost + Overhead + Desired Profit\n\nRecommended Price = higher of the two`,
    workedExample: `Ingredient cost: $5.00. Target food cost: 30%. Overhead: $2.00. Desired profit: $3.00. Competitor price: $17.\n\nPrice from Food Cost Target = $5.00 ÷ 30% = $16.67\nPrice from Full Cost + Profit = $5.00 + $2.00 + $3.00 = $10.00\nRecommended Price = $16.67 (the higher, more conservative price)\nAt competitor's $17 price, implied food cost = $5.00 ÷ $17 = 29.4% — close to target, suggesting the market can bear this price.`,
    faqs: [
      { q: "Which pricing method should I trust more?", a: "Food cost % pricing tends to be more conservative and protective of margin on high-cost ingredients; full cost + profit pricing better reflects your true operating costs. Using the higher of the two as a floor, then checking against competitor pricing, gives a balanced result." },
      { q: "How do I estimate overhead allocation per plate?", a: "Divide your total monthly fixed overhead (rent, base labor, utilities, insurance) by your total estimated monthly covers (plates sold) to get a rough per-plate overhead figure." },
      { q: "Should I price every dish the same way?", a: "No — high-visibility 'anchor' items often absorb a lower margin to drive traffic and perceived value, while less prominent items on the menu can carry a higher margin to balance out the overall average." },
      { q: "How often should menu prices be updated?", a: "Review pricing at least twice a year, or immediately after a significant shift in ingredient costs — small, frequent adjustments are generally received better by customers than large, infrequent price jumps." },
      { q: "Does psychological pricing (like $15.95 vs $16) matter?", a: "Yes — pricing just under a round number is a well-established retail and restaurant convention that can improve perceived value, though it should still be built on top of your actual cost-based price floor, not replace it." },
    ],
  },
};

export default config;