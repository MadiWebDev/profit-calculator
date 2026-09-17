import type { CalculatorConfig } from "@/types/calculator";

const config: CalculatorConfig = {
  slug: "crypto-staking-roi",
  title: "Crypto Staking ROI Calculator", 
  shortTitle: "Staking ROI",
  description: "Calculate projected staking rewards, APY compounding, and net ROI after validator/platform fees.",
  metaDescription: "Free crypto staking ROI calculator. Enter amount staked, APY, staking period, and platform fee to calculate total rewards, compounded value, and net ROI %.",
  keywords: ["crypto staking calculator", "staking rewards calculator", "staking roi calculator", "apy calculator crypto", "eth staking calculator"],
  icon: "🔗",
  category: "investing",
  relatedSlugs: ["crypto-profit", "compound-interest", "dividend-yield"],
  fields: [
    { name: "amountStaked",   label: "Amount Staked (in USD value)", type: "currency", defaultValue: 10000, min: 0 },
    { name: "apy",            label: "Advertised APY %",             type: "percent",  defaultValue: 5.5,   min: 0, max: 200 },
    { name: "stakingDays",    label: "Staking Period (days)",        type: "number",   defaultValue: 365,   min: 1 },
    { name: "compoundingFrequency", label: "Compounds per Year",     type: "number",   defaultValue: 365,   min: 1, max: 365, helpText: "365 = daily auto-compound, 12 = monthly, 1 = no compounding" },
    { name: "platformFeePct", label: "Platform / Validator Fee %",   type: "percent",  defaultValue: 10,    min: 0, max: 50, helpText: "% of rewards taken by validator or platform" },
  ],
  outputs: [
    { key: "grossRewards",   label: "Gross Rewards",          format: "currency", highlight: true },
    { key: "platformFeeAmt", label: "Platform / Validator Fee", format: "currency" },
    { key: "netRewards",     label: "Net Rewards",            format: "currency", highlight: true },
    { key: "netApy",         label: "Effective Net APY %",    format: "percent",  highlight: true },
    { key: "endingBalance",  label: "Ending Balance",         format: "currency" },
  ],
  chartKeys: ["amountStaked", "netRewards"],
  compute(v) {
    const years = v.stakingDays / 365;
    const n = v.compoundingFrequency;
    const ratePerPeriod = v.apy / 100 / n;
    const totalPeriods = n * years;
    const grossEndingBalance = v.amountStaked * Math.pow(1 + ratePerPeriod, totalPeriods);
    const grossRewards = grossEndingBalance - v.amountStaked;
    const platformFeeAmt = (grossRewards * v.platformFeePct) / 100;
    const netRewards = grossRewards - platformFeeAmt;
    const endingBalance = v.amountStaked + netRewards;
    const netApy = years > 0 && v.amountStaked > 0 ? (Math.pow(endingBalance / v.amountStaked, 1 / years) - 1) * 100 : 0;
    return { grossRewards, platformFeeAmt, netRewards, netApy, endingBalance };
  },
  seoContent: {
    intro: `Advertised staking APYs are gross numbers — before the validator or platform takes its cut, and often assuming perfect auto-compounding you may not actually get. This calculator shows your real net rewards and effective APY after fees, so you can compare staking offers honestly.`,
    howToSteps: [
      "Enter the **USD value of the amount you're staking**.",
      "Enter the **advertised APY %** from the platform or validator.",
      "Set your **staking period** in days.",
      "Choose the **compounding frequency** — daily auto-compound, monthly, or none.",
      "Enter the **platform or validator fee %** taken from your rewards.",
      "Review gross rewards, net rewards after fees, and your effective net APY.",
    ],
    formula: `Ending Balance (gross) = Amount × (1 + APY/n)^(n × years)\n\nGross Rewards = Ending Balance − Amount Staked\n\nNet Rewards = Gross Rewards × (1 − Platform Fee %)`,
    workedExample: `Staked: $10,000. APY: 5.5%, compounded daily. Period: 365 days. Platform fee: 10%.\n\nGross Ending Balance ≈ $10,000 × (1 + 0.055/365)^365 ≈ $10,565.50\nGross Rewards ≈ $565.50\nPlatform Fee = 10% × $565.50 ≈ $56.55\nNet Rewards ≈ $508.95\nEffective Net APY ≈ 5.09%`,
    faqs: [
      { q: "Is staking APY guaranteed?", a: "No. Staking APY typically fluctuates with network activity, validator performance, and total amount staked network-wide. Advertised rates are estimates, not guarantees, and can change day to day." },
      { q: "What fees do staking platforms and validators charge?", a: "Validators commonly charge a commission of 5–15% of your staking rewards (not your principal). Centralized exchanges offering staking may also apply their own additional fee on top." },
      { q: "Is my staked crypto at risk?", a: "Yes — staked assets can be subject to slashing penalties (for validator misbehavior), lock-up/unbonding periods that limit liquidity, and the underlying price volatility of the asset itself. Staking rewards don't eliminate market risk." },
      { q: "Does compounding frequency matter much for staking?", a: "At typical staking APYs (3–10%), the difference between daily and monthly compounding is usually small — a fraction of a percentage point over a year. It matters much more at very high APYs." },
      { q: "Are staking rewards taxable?", a: "In many jurisdictions, staking rewards are taxed as income at the time you receive them, based on their fair market value, with any later sale also potentially triggering capital gains tax. Rules vary widely — consult a tax professional." },
    ],
  },
};

export default config;