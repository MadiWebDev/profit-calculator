import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "mortgage-affordability",
  title: "Mortgage Payment & Affordability Calculator",
  shortTitle: "Mortgage Payment",
  description: "Calculate your monthly mortgage payment, total interest, and how much home you can afford.",
  metaDescription: "Free mortgage calculator. Enter home price, down payment, interest rate, and loan term to calculate your monthly payment, total interest, and affordability based on income.",
  keywords: ["mortgage calculator", "mortgage payment calculator", "home affordability calculator", "monthly mortgage calculator", "how much house can i afford"],
  icon: "🏦",
  category: "real-estate",
  relatedSlugs: ["rental-property-roi", "rent-vs-buy", "refinance-savings"],
  fields: [
    { name: "homePrice",     label: "Home Price",            type: "currency", defaultValue: 350000, min: 0 },
    { name: "downPayment",   label: "Down Payment",          type: "currency", defaultValue: 70000,  min: 0 },
    { name: "interestRate",  label: "Interest Rate % (APR)", type: "percent",  defaultValue: 6.5,    min: 0, max: 25 },
    { name: "loanTermYears", label: "Loan Term (years)",     type: "number",   defaultValue: 30,     min: 1, max: 40 },
    { name: "propertyTaxAnnual", label: "Annual Property Tax", type: "currency", defaultValue: 4200, min: 0 },
    { name: "annualInsurance",   label: "Annual Home Insurance", type: "currency", defaultValue: 1500, min: 0 },
    { name: "monthlyHoa",        label: "Monthly HOA",       type: "currency", defaultValue: 0,      min: 0 },
    { name: "annualIncome",      label: "Annual Household Income", type: "currency", defaultValue: 110000, min: 0, helpText: "Used to check the payment against the 28% affordability rule" },
  ],
  outputs: [
    { key: "monthlyPI",        label: "Principal & Interest / mo", format: "currency", highlight: true },
    { key: "monthlyPayment",   label: "Total Monthly Payment",     format: "currency", highlight: true, description: "PITI + HOA" },
    { key: "loanAmount",       label: "Loan Amount",               format: "currency" },
    { key: "totalInterest",    label: "Total Interest Over Loan",  format: "currency" },
    { key: "totalPaid",        label: "Total Paid Over Loan",      format: "currency" },
    { key: "affordabilityPct", label: "% of Income to Housing",    format: "percent", highlight: true, description: "28% or below is generally considered affordable" },
    { key: "maxAffordablePayment", label: "Max Recommended Payment", format: "currency", description: "28% of gross monthly income" },
    { key: "downPaymentPct",   label: "Down Payment %",            format: "percent" },
  ],
  chartKeys: ["loanAmount", "totalInterest"],
  compute(v) {
    const loanAmount = Math.max(0, v.homePrice - v.downPayment);
    const monthlyRate = v.interestRate / 100 / 12;
    const numPayments = v.loanTermYears * 12;
    const monthlyPI = monthlyRate > 0 && numPayments > 0
      ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
      : (numPayments > 0 ? loanAmount / numPayments : 0);
    const monthlyTax = v.propertyTaxAnnual / 12;
    const monthlyInsurance = v.annualInsurance / 12;
    const monthlyPayment = monthlyPI + monthlyTax + monthlyInsurance + v.monthlyHoa;
    const totalPaid = monthlyPI * numPayments;
    const totalInterest = totalPaid - loanAmount;
    const monthlyIncome = v.annualIncome / 12;
    const affordabilityPct = monthlyIncome > 0 ? (monthlyPayment / monthlyIncome) * 100 : 0;
    const maxAffordablePayment = monthlyIncome * 0.28;
    const downPaymentPct = v.homePrice > 0 ? (v.downPayment / v.homePrice) * 100 : 0;
    return { monthlyPI, monthlyPayment, loanAmount, totalInterest, totalPaid, affordabilityPct, maxAffordablePayment, downPaymentPct };
  },
  seoContent: {
    intro: `Your mortgage payment is more than principal and interest — property tax, insurance, and HOA dues all add up. This calculator gives you the full monthly payment (PITI) on any home price and financing scenario, plus checks it against the classic 28% affordability guideline lenders use.`,
    howToSteps: [
      "Enter the **home price** you're considering.",
      "Enter your planned **down payment**.",
      "Set the **interest rate** you expect to qualify for.",
      "Choose your **loan term** — 30 years is standard, 15 years saves interest but raises the payment.",
      "Add **annual property tax** and **home insurance** estimates for the area.",
      "Add **monthly HOA dues** if applicable.",
      "Enter your **annual household income** to check affordability against the 28% rule.",
    ],
    formula: `Loan Amount = Home Price − Down Payment\n\nMonthly P&I = [L × r × (1+r)^n] ÷ [(1+r)^n − 1], where r = monthly rate, n = number of payments\n\nTotal Monthly Payment = P&I + Property Tax/mo + Insurance/mo + HOA`,
    workedExample: `Home price: $350,000. Down payment: $70,000. Rate: 6.5%. Term: 30 years. Tax: $4,200/yr. Insurance: $1,500/yr.\n\nLoan Amount = $280,000\nMonthly Rate = 6.5% ÷ 12 = 0.5417%\nMonthly P&I ≈ $1,769.65\nMonthly Tax = $350, Monthly Insurance = $125\nTotal Monthly Payment ≈ $2,244.65`,
    faqs: [
      { q: "What is PITI?", a: "PITI stands for Principal, Interest, Taxes, and Insurance — the four components most lenders bundle into your total monthly mortgage payment, sometimes with HOA dues added on top." },
      { q: "How much house can I afford?", a: "A common rule of thumb is keeping total housing costs at or below 28% of gross monthly income, and total debt payments below 36%. Lenders may qualify you higher, but staying near 28% leaves more financial breathing room." },
      { q: "Is a 15-year or 30-year mortgage better?", a: "A 15-year mortgage has a higher monthly payment but dramatically less total interest and builds equity faster. A 30-year mortgage has lower payments, more flexibility, and lets you invest the difference — the right choice depends on your cash flow and goals." },
      { q: "How much down payment do I need?", a: "Conventional loans often allow as little as 3–5% down, FHA loans 3.5%, and VA/USDA loans 0% for eligible buyers. Putting down 20% avoids private mortgage insurance (PMI) but isn't strictly required." },
      { q: "Does this include PMI?", a: "This calculator doesn't automatically add PMI. If your down payment is below 20%, add an estimated PMI cost (typically 0.3–1.5% of the loan annually) to your monthly expenses manually." },
    ],
  },
};

export default config;