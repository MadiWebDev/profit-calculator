import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "break-even-point",
  title: "Break-Even Point Calculator",
  shortTitle: "Break-Even Point",
  description: "Calculate how many units or how much revenue you need to cover your fixed and variable costs.",
  metaDescription: "Free break-even point calculator. Enter fixed costs, price per unit, and variable cost per unit to calculate break-even units, break-even revenue, and margin of safety.",
  keywords: ["break even point calculator", "break even analysis calculator", "break even revenue calculator", "contribution margin calculator"],
  icon: "⚖️",
  category: "general",
  relatedSlugs: ["profit-margin", "saas-pricing-margin", "burn-rate-runway"],
  fields: [
    { name: "fixedCosts",     label: "Total Fixed Costs (monthly)", type: "currency", defaultValue: 10000, min: 0, helpText: "Rent, salaries, insurance, subscriptions — costs that don't change with sales volume" },
    { name: "pricePerUnit",   label: "Price per Unit",              type: "currency", defaultValue: 50,    min: 0 },
    { name: "variableCostPerUnit", label: "Variable Cost per Unit", type: "currency", defaultValue: 20,    min: 0, helpText: "Materials, direct labor, shipping — costs that scale with each sale" },
    { name: "currentUnitsSold", label: "Current Units Sold (monthly)", type: "number", defaultValue: 300,  min: 0, helpText: "Used to calculate your margin of safety" },
  ],
  outputs: [
    { key: "contributionMargin",     label: "Contribution Margin per Unit", format: "currency", highlight: true },
    { key: "contributionMarginPct",  label: "Contribution Margin %",  format: "percent" },
    { key: "breakEvenUnits",         label: "Break-Even Units",       format: "number",   highlight: true },
    { key: "breakEvenRevenue",       label: "Break-Even Revenue",     format: "currency", highlight: true },
    { key: "marginOfSafetyUnits",    label: "Margin of Safety (units)", format: "number" },
    { key: "marginOfSafetyPct",      label: "Margin of Safety %",     format: "percent",  highlight: true, description: "How far current sales are above break-even" },
  ],
  chartKeys: ["fixedCosts", "breakEvenRevenue"],
  compute(v) {
    const contributionMargin = v.pricePerUnit - v.variableCostPerUnit;
    const contributionMarginPct = v.pricePerUnit > 0 ? (contributionMargin / v.pricePerUnit) * 100 : 0;
    const breakEvenUnits = contributionMargin > 0 ? Math.ceil(v.fixedCosts / contributionMargin) : 0;
    const breakEvenRevenue = breakEvenUnits * v.pricePerUnit;
    const marginOfSafetyUnits = v.currentUnitsSold - breakEvenUnits;
    const marginOfSafetyPct = v.currentUnitsSold > 0 ? (marginOfSafetyUnits / v.currentUnitsSold) * 100 : 0;
    return { contributionMargin, contributionMarginPct, breakEvenUnits, breakEvenRevenue, marginOfSafetyUnits, marginOfSafetyPct };
  },
  seoContent: {
    intro: `Break-even analysis answers the single most important question before launching any product or business line: how many units do I need to sell before I stop losing money? This calculator finds your exact break-even point in both units and revenue, plus your margin of safety if you're already selling.`,
    howToSteps: [
      "Enter your **total fixed costs** for the period — rent, salaries, insurance, subscriptions.",
      "Enter your **price per unit**.",
      "Enter your **variable cost per unit** — materials, direct labor, shipping.",
      "Enter your **current units sold** (optional) to calculate your margin of safety.",
      "Review your contribution margin, break-even units, and break-even revenue.",
    ],
    formula: `Contribution Margin = Price per Unit − Variable Cost per Unit\n\nBreak-Even Units = Fixed Costs ÷ Contribution Margin\n\nBreak-Even Revenue = Break-Even Units × Price per Unit\n\nMargin of Safety % = (Current Units − Break-Even Units) ÷ Current Units × 100`,
    workedExample: `Fixed costs: $10,000/mo. Price: $50/unit. Variable cost: $20/unit. Current sales: 300 units/mo.\n\nContribution Margin = $50 − $20 = $30\nBreak-Even Units = $10,000 ÷ $30 = 334 units\nBreak-Even Revenue = 334 × $50 = $16,700\nMargin of Safety = (300 − 334) ÷ 300 = −11.3% (currently below break-even)`,
    faqs: [
      { q: "What's the difference between fixed and variable costs?", a: "Fixed costs stay the same regardless of sales volume (rent, salaries, insurance). Variable costs scale directly with each unit sold (materials, direct labor, packaging, shipping). Break-even analysis depends on correctly separating the two." },
      { q: "What is contribution margin?", a: "Contribution margin is the amount each unit sold contributes toward covering fixed costs, after variable costs are subtracted. Once cumulative contribution margin covers all fixed costs, every additional unit is pure profit." },
      { q: "What is margin of safety?", a: "Margin of safety measures how far your current (or projected) sales are above the break-even point, as a percentage. A higher margin of safety means more cushion before a sales downturn would push you into a loss." },
      { q: "How do price changes affect break-even point?", a: "Raising price per unit increases contribution margin, which lowers the number of units needed to break even — a small price increase can meaningfully reduce your break-even threshold if demand doesn't drop off in response." },
      { q: "Does break-even analysis work for service businesses too?", a: "Yes — treat billable hours or client engagements as the 'unit,' with your rate as the price and any direct delivery costs (contractor pay, tools) as the variable cost per unit." },
    ],
  },
};

export default config;