import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "valuation-multiple",
  title: "Valuation Multiple Calculator",
  shortTitle: "Valuation Multiple",
  description: "Estimate business value using EBITDA or revenue multiples — useful for acquisition analysis, fundraising, and benchmarking.",
  metaDescription: "Free business valuation multiple calculator. Enter EBITDA or revenue with industry multiple to estimate enterprise value, or use inverse mode to calculate required EBITDA from a target valuation.",
  keywords: ["valuation multiple calculator", "business valuation", "EBITDA multiple", "revenue multiple", "enterprise value", "business valuation formula"],
  icon: "📈",
  category: "finance",
  relatedSlugs: ["ebitda-margin", "exit-multiple", "saas-churn-cost", "roi"],
  fields: [
    { name: "ebitda",        label: "EBITDA",               type: "currency", defaultValue: 500000, min: 0 },
    { name: "revenue",       label: "Annual Revenue",         type: "currency", defaultValue: 2500000, min: 0 },
    { name: "multiple",      label: "Industry Multiple",      type: "number",   defaultValue: 4,    min: 0,  max: 100, helpText: "Multiple of EBITDA or revenue, depending on mode" },
    { name: "valuationType", label: "Valuation Metric",       type: "select",   defaultValue: 0, options: [
      { value: "EBITDA", label: "EBITDA Multiple" },
      { value: "Revenue",  label: "Revenue Multiple" },
    ]},  
  ],
  outputs: [
    { key: "enterpriseValue", label: "Enterprise Value (EV)", format: "currency", highlight: true },
  ],
  chartKeys: ["ebitda", "revenue"],
  compute(v) {
    const enterpriseValue = v.valuationType === 0
      ? v.ebitda * v.multiple
      : v.revenue * v.multiple;
    return { enterpriseValue };
  },
  seoContent: {
    intro: `How much is your business actually worth? This calculator estimates enterprise value using industry-standard EBITDA or revenue multiples. Enter your financials, pick your multiple, and see what buyers or investors might pay — or flip it to determine how much EBITDA you need to hit a specific valuation target.`,
    howToSteps: [
      "Select **EBITDA** or **Revenue** as your valuation metric.",
      "Enter your latest full-year **EBITDA** or **Annual Revenue**.",
      "Enter the **Industry Multiple** (typically 3–10x, depending on industry, growth, and market conditions).",
      "The calculator shows your estimated **Enterprise Value**.",
      "Optional: Enter a **negative multiple** to solve for the EBITDA or revenue needed to reach a target valuation.",
    ],
    formula: `Enterprise Value = EBITDA × EBITDA Multiple
Enterprise Value = Revenue × Revenue Multiple
EBITDA = Target Valuation ÷ EBITDA Multiple
Revenue = Target Valuation ÷ Revenue Multiple`,
    workedExample: `EBITDA: $500,000. Multiple: 4x. Revenue: $2,500,000.
If using EBITDA: $500,000 × 4 = $2,000,000 EV
If using Revenue: $2,500,000 × 4 = $10,000,000 EV
(Revenue multiples are typically higher in high-growth SaaS and tech sectors).`,
    faqs: [
      { q: "What's a 'good' multiple for my business?", a: "Multiples vary wildly by industry, growth rate, profitability, and market conditions. SaaS businesses often trade at 4–10x revenue, while traditional service businesses might be 2–5x EBITDA, and e-commerce varies widely. Compare against public comps and recent M&A in your space." },
      { q: "How do I find the right multiple for my industry?", a: "Research recent acquisition multiples for similar-sized companies in your industry, check industry survey data, and talk to business brokers or M&A advisors. High-growth, recurring-revenue businesses command premium multiples." },
      { q: "What's the difference between Enterprise Value and Equity Value?", a: "Enterprise Value (EV) represents the total value of the business (Debt + Equity). Equity Value = EV - Debt + Cash. Most multiples calculate Enterprise Value because debt and cash are often assumed to be adjusted at closing." },
      { q: "Should I use EBITDA or Revenue multiple?", a: "Use EBITDA if your business is profitable and EBITDA is a reliable indicator of cash flow. Use Revenue multiple if your business is growing fast but not yet profitable (common in tech/SaaS). Some acquirers use both." },
      { q: "Can I calculate my required valuation if I already know the multiple?", a: "Yes. Just enter the multiple as a negative number (e.g., -4) and the valuation as a positive number in the field that corresponds to the multiple type you're using. The calculator will show the required EBITDA or revenue." },
    ],
  },
};
 
export default config;