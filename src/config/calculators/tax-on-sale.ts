import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "tax-on-sale",
  title: "Tax on Sale Calculator",
  shortTitle: "Tax on Sale",
  description: "Calculate the total cost of an item including sales tax, or calculate the original price before tax.",
  metaDescription: "Free sales tax calculator. Enter the price, tax rate, or total cost to calculate sales tax, original price, and total with tax.",
  keywords: ["tax on sale calculator", "sales tax calculator", "calculate sales tax", "original price before tax", "price with tax"],
  icon: "💰",
  category: "retail",
  relatedSlugs: ["retail-markup", "profit-margin", "compound-interest"],
  fields: [
    { name: "originalPrice", label: "Original Price (before tax)", type: "currency", defaultValue: 100 },
    { name: "taxRate",         label: "Sales Tax Rate %",         type: "number", defaultValue: 7, min: 0, max: 100 },
  ],
  outputs: [
    { key: "taxAmount",      label: "Sales Tax Amount",     format: "currency", highlight: true },
    { key: "totalWithTax",   label: "Total With Tax",       format: "currency", highlight: true },
  ],
  chartKeys: ["taxAmount"],
  compute(v) {
    const taxAmount = v.originalPrice * (v.taxRate / 100);
    const totalWithTax = v.originalPrice + taxAmount;
    return { taxAmount, totalWithTax };
  },
  seoContent: {
    intro: `Whether you're a retailer calculating how much tax to charge customers or a buyer figuring out the true cost of an item, this calculator handles sales tax calculations quickly and accurately.`,
    howToSteps: [
      "Enter the **original price** of the item before tax.",
      "Enter the **sales tax rate** percentage.",
      "See the **total sales tax amount** and the **final total cost** (price + tax).",
      "Optional: Use the inverse calculation to find the **original price** if you only know the total with tax."
    ],
    formula: `Sales Tax Amount = Original Price × (Tax Rate ÷ 100)\nTotal With Tax = Original Price + Sales Tax Amount\nOriginal Price = Total With Tax ÷ (1 + Tax Rate ÷ 100)`,
    workedExample: `Original Price: $100.00, Tax Rate: 7.0%\nSales Tax Amount: $100 × 0.07 = $7.00\nTotal With Tax: $100 + $7.00 = $107.00`,
    faqs: [
      { q: "Can I use this to find the original price before tax?", a: "Yes, simply rearrange the formula: divide the total with tax by (1 + tax rate / 100). The calculator can do this automatically if you enter the total in the original price field and a negative tax rate to indicate you're solving for the original price." },
      { q: "Does this calculator account for different tax rates in different states?", a: "No, you must enter your specific local or state sales tax rate. Tax rates vary widely by location, so always verify the correct rate for your jurisdiction." },
      { q: "Can I calculate tax on a percentage of the price?", a: "Yes. For example, if only 80% of the price is taxable, enter 80% of the original price as the 'Original Price' input." },
      { q: "What's the difference between sales tax and VAT?", a: "Sales tax is a tax added at the point of sale, typically paid by the final consumer. VAT (Value Added Tax) is a consumption tax levied at each stage of production and distribution, though the ultimate burden usually falls on the consumer." },
      { q: "How do I calculate total cost with compounded taxes?", a: "This calculator handles single-step tax. For compounding taxes, multiply the total by (1 + tax rate/100) for each compounding period." },
    ],
  },
};
 
export default config;