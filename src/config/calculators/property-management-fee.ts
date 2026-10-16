import type { CalculatorConfig } from "@/types/calculator";
 
const config: CalculatorConfig = {
  slug: "property-management-fee",
  title: "Property Management Fee Calculator",
  shortTitle: "Property Mgmt Fee",
  description: "Calculate the true cost of hiring a property manager and its impact on your rental cash flow.",
  metaDescription: "Free property management fee calculator. Enter monthly rent, management fee %, leasing fee, and maintenance markup to see total annual management cost and impact on cash flow.",
  keywords: ["property management fee calculator", "property manager cost calculator", "rental management fee calculator", "landlord fee calculator"],
  icon: "🔑",
  category: "real-estate",
  relatedSlugs: ["rental-property-roi", "cap-rate", "airbnb-profit"],
  fields: [
    { name: "monthlyRent",        label: "Monthly Rent",              type: "currency", defaultValue: 2000, min: 0 },
    { name: "managementFeePct",   label: "Monthly Management Fee %",  type: "percent",  defaultValue: 9,    min: 0, max: 20, helpText: "Typically 8–12% of collected rent" },
    { name: "leasingFeePct",      label: "New Tenant Leasing Fee %",  type: "percent",  defaultValue: 75,   min: 0, max: 150, helpText: "% of one month's rent, charged when placing a new tenant" },
    { name: "tenantTurnoverYears",label: "Avg. Years per Tenant",     type: "number",   defaultValue: 2,    min: 0.5, helpText: "How often you expect turnover" },
    { name: "maintenanceMarkupPct", label: "Maintenance Markup %",    type: "percent",  defaultValue: 10,   min: 0, max: 30, helpText: "Manager's markup on repair invoices" },
    { name: "annualMaintenanceCost", label: "Annual Maintenance Spend", type: "currency", defaultValue: 1500, min: 0 },
    { name: "monthlyCashFlowSelf", label: "Your Current Monthly Cash Flow (self-managed)", type: "currency", defaultValue: 500, min: -10000, helpText: "Cash flow before hiring a manager" },
  ],
  outputs: [
    { key: "annualManagementFees", label: "Annual Management Fees",  format: "currency", highlight: true },
    { key: "annualLeasingCost",    label: "Annualized Leasing Cost", format: "currency" },
    { key: "annualMaintenanceMarkupCost", label: "Maintenance Markup Cost", format: "currency" },
    { key: "totalAnnualCost",      label: "Total Annual Mgmt Cost",  format: "currency", highlight: true },
    { key: "newMonthlyCashFlow",   label: "New Monthly Cash Flow",   format: "currency", highlight: true },
    { key: "cashFlowImpact",       label: "Monthly Cash Flow Impact",format: "currency" },
    { key: "costPerRentDollar",    label: "Effective Cost % of Rent",format: "percent", description: "Total annual cost ÷ annual rent" },
  ],
  chartKeys: ["annualManagementFees", "annualLeasingCost", "annualMaintenanceMarkupCost"],
  compute(v) {
    const annualRent = v.monthlyRent * 12;
    const annualManagementFees = (v.monthlyRent * v.managementFeePct / 100) * 12;
    const leasingFeeAmt = (v.monthlyRent * v.leasingFeePct) / 100;
    const annualLeasingCost = v.tenantTurnoverYears > 0 ? leasingFeeAmt / v.tenantTurnoverYears : 0;
    const annualMaintenanceMarkupCost = (v.annualMaintenanceCost * v.maintenanceMarkupPct) / 100;
    const totalAnnualCost = annualManagementFees + annualLeasingCost + annualMaintenanceMarkupCost;
    const monthlyCostImpact = totalAnnualCost / 12;
    const newMonthlyCashFlow = v.monthlyCashFlowSelf - monthlyCostImpact;
    const cashFlowImpact = -monthlyCostImpact;
    const costPerRentDollar = annualRent > 0 ? (totalAnnualCost / annualRent) * 100 : 0;
    return { annualManagementFees, annualLeasingCost, annualMaintenanceMarkupCost, totalAnnualCost, newMonthlyCashFlow, cashFlowImpact, costPerRentDollar };
  },
  seoContent: {
    intro: `Hiring a property manager buys back your time, but the fees stack up in ways that aren't always obvious upfront: a monthly percentage of rent, a leasing fee every time a tenant turns over, and often a markup on maintenance invoices. This calculator adds it all up so you can see the real annual cost and the resulting hit to your cash flow.`,
    howToSteps: [
      "Enter your **monthly rent**.",
      "Enter the **monthly management fee %** the company charges — usually 8–12% of collected rent.",
      "Add the **leasing fee %** charged for placing a new tenant, typically 50–100% of one month's rent.",
      "Estimate **how often you expect tenant turnover** in years.",
      "Add the manager's **maintenance markup %** on repair invoices, if any.",
      "Enter your **estimated annual maintenance spend**.",
      "Enter your **current self-managed cash flow** to see the after-fee impact.",
    ],
    formula: `Annual Management Fees = Monthly Rent × Fee % × 12\n\nAnnualized Leasing Cost = (Rent × Leasing Fee %) ÷ Years per Tenant\n\nTotal Annual Cost = Management Fees + Leasing Cost + Maintenance Markup`,
    workedExample: `Rent: $2,000/mo. Mgmt fee: 9%. Leasing fee: 75% of rent every 2 years. Maintenance markup: 10% on $1,500/yr.\n\nAnnual Management Fees = $2,000 × 9% × 12 = $2,160\nLeasing Fee = 75% × $2,000 = $1,500 ÷ 2 years = $750/yr\nMaintenance Markup = 10% × $1,500 = $150\nTotal Annual Cost = $2,160 + $750 + $150 = $3,060 (≈12.75% of annual rent)`,
    faqs: [
      { q: "What is a typical property management fee?", a: "Most property managers charge 8–12% of collected monthly rent, though rates can range from 6% in high-rent markets to 15%+ for single-family homes in lower-rent areas." },
      { q: "Do property managers charge a leasing fee?", a: "Most do — typically 50–100% of one month's rent each time they place a new tenant, on top of the ongoing monthly management fee." },
      { q: "Is hiring a property manager worth it?", a: "It depends on your time value, distance from the property, and portfolio size. If management fees consume most of your cash flow margin, self-managing (or raising rents) may be worth considering — but many investors find the time saved and professional tenant screening worth the cost." },
      { q: "Do property managers mark up maintenance costs?", a: "Some do, typically 10–20% on top of vendor invoices. Always ask upfront whether markups apply and get them in writing in your management agreement." },
      { q: "Can I negotiate property management fees?", a: "Yes, especially with multiple units or a strong local relationship. Portfolio landlords often negotiate reduced percentage fees or waived leasing fees in exchange for volume." },
    ],
  },
};

export default config;