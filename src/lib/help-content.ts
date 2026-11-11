/**
 * Help Center content — the single source of truth for the /help FAQ and
 * glossary. Answers must stay consistent with real, verified behaviour:
 * prices are Starter $3 / Growth $18 / Pro $29 per month, every paid plan
 * starts with a 7-day free trial (no card), and billing runs through
 * Paddle. Do not add a price, a feature, or a live-integration claim here
 * without a code or production reference to back it.
 */

export const HELP_FAQ_CATEGORIES = [
  "Getting started",
  "Billing & plans",
  "Connecting stores & ads",
  "Profit & reports",
  "Account & security",
] as const;

export type HelpFaqCategory = (typeof HELP_FAQ_CATEGORIES)[number];

export interface HelpFaq {
  id: string;
  category: HelpFaqCategory;
  question: string;
  answer: string;
}

export const HELP_FAQS: HelpFaq[] = [
  // ── Getting started ──────────────────────────────────────────────────
  {
    id: "calculators-free",
    category: "Getting started",
    question: "Are the calculators really free?",
    answer:
      "Yes — every calculator on GetProfitCalc is completely free, forever. No account needed, no limits, no credit card.",
  },
  {
    id: "calculators-vs-saas",
    category: "Getting started",
    question: "What's the difference between the free calculators and the SaaS platform?",
    answer:
      "The free calculators are one-off tools you use manually. The SaaS platform connects to your actual store and automatically tracks every order's real profit in real time, with AI insights, goal tracking, and reports.",
  },
  {
    id: "trial-no-card",
    category: "Getting started",
    question: "Do I need a credit card to start the 7-day trial?",
    answer:
      "No. Sign up with just your email. No credit card is required until you choose to upgrade after your trial ends.",
  },
  {
    id: "connect-shopify",
    category: "Getting started",
    question: "How do I connect my Shopify store?",
    answer:
      "After you sign up, onboarding asks for your store domain. Enter it as your-store.myshopify.com, then approve the connection on Shopify's OAuth page. Once approved you are sent back to the dashboard and your orders start syncing. You can add another store later from Dashboard → Stores, within your plan's store limit. No Shopify store, or want historical data first? Use the CSV import on the same onboarding screen.",
  },
  {
    id: "import-historical-orders",
    category: "Getting started",
    question: "Can I import historical orders?",
    answer:
      "Yes. Use our CSV import to upload historical order data, within your plan's monthly order limit. We provide a template with all the columns we expect.",
  },
  // ── Billing & plans ──────────────────────────────────────────────────
  {
    id: "saas-pricing",
    category: "Billing & plans",
    question: "How much does the SaaS platform cost?",
    answer:
      "Starter is $3/month, Growth is $18/month, and Pro is $29/month. Longer billing saves more: quarterly is 10% off, semiannual is 15% off, and annual is 20% off. Every paid plan starts with a 7-day free trial, no credit card required.",
  },
  {
    id: "who-charges-me",
    category: "Billing & plans",
    question: "Who charges me, and how does billing work?",
    answer:
      "Payments are processed by Paddle, our Merchant of Record, who handles payment processing, invoicing, and VAT/sales-tax collection. Subscriptions are billed in advance and renew automatically at the end of each billing period unless you cancel from Dashboard → Settings → Billing & Plan. For refunds, see the Refund Policy.",
  },
  {
    id: "trial-ends",
    category: "Billing & plans",
    question: "What happens when my 7-day trial ends?",
    answer:
      "If you don't subscribe, your account is archived when the trial ends: the dashboard locks and shows an upgrade screen until you choose a plan. You won't be charged — no card is taken during the trial. Your data stays in place while the account is archived, so upgrading brings your dashboard back as it was.",
  },
  {
    id: "invite-team",
    category: "Billing & plans",
    question: "Can I invite my team?",
    answer:
      "Yes, on Growth and Pro. Starter is solo use. Growth includes 1 team member and Pro includes 5 team members, beyond the account owner.",
  },
  {
    id: "order-limits",
    category: "Billing & plans",
    question: "What are the order and store limits on each plan?",
    answer:
      "Starter includes 100 orders a month and 1 store, Growth includes 1,000 orders a month and 2 stores, and Pro is unlimited on both. Your current usage is shown in the dashboard sidebar, and you can upgrade any time from Dashboard → Settings → Billing & Plan.",
  },
  // ── Connecting stores & ads ──────────────────────────────────────────
  {
    id: "supported-platforms",
    category: "Connecting stores & ads",
    question: "Which platforms does the profit tracker support?",
    answer:
      "Shopify (OAuth), plus CSV import for historical orders. More native integrations are being added regularly.",
  },
  {
    id: "connect-meta",
    category: "Connecting stores & ads",
    question: "How do I connect Meta (Facebook) ads?",
    answer:
      "Go to Dashboard → Ad Platforms and choose Connect next to Meta. You'll be sent to Facebook to approve access to your ad accounts (permissions: ads_read, ads_management, business_management). Once approved, your ad accounts appear on the Ad Platforms page and spend starts syncing so it can be matched to your orders. If an account shows an error, use its refresh button to re-sync.",
  },
  {
    id: "connect-tiktok",
    category: "Connecting stores & ads",
    question: "How do I connect TikTok ads?",
    answer:
      "Go to Dashboard → Ad Platforms and choose Connect next to TikTok. You'll be sent to TikTok's Marketing API authorization page, which asks for the ad_account and report scopes — read-only access to your ad accounts and their reporting data. After approval, TikTok spend syncs the same way as Meta spend. If the connect step reports that TikTok isn't configured, the TikTok app credentials aren't set up yet — contact support and we'll confirm the status.",
  },
  {
    id: "which-ad-platforms",
    category: "Connecting stores & ads",
    question: "Which ad platforms can I connect?",
    answer:
      "Meta, Google, TikTok, Pinterest, and Snapchat. Plan limits apply: 1 ad platform on Starter, 3 on Growth, and unlimited on Pro. Connect them from Dashboard → Ad Platforms.",
  },
  {
    id: "multi-currency",
    category: "Connecting stores & ads",
    question: "Do you support multiple currencies?",
    answer:
      "Yes. Order profit is converted to your store currency before totals are calculated, so mixed-currency orders are never summed 1:1. Rates come from currencyapi.net, with a fallback provider if it is unavailable.",
  },
  // ── Profit & reports ─────────────────────────────────────────────────
  {
    id: "ai-insights",
    category: "Profit & reports",
    question: "How does AI Insights work?",
    answer:
      "We send your aggregated profit data (no personal customer info) to an AI provider (OpenRouter or Groq), which generates 3 proactive insights about your business. Available on Growth and Pro plans.",
  },
  {
    id: "net-profit-formula",
    category: "Profit & reports",
    question: "How is my net profit calculated?",
    answer:
      "Net profit is net revenue minus every merchant cost we track: COGS, shipping, transaction fees, ad spend, packaging, COD fees, RTO loss, and other costs. Refunds and chargebacks reduce net revenue rather than appearing as a cost, and cancelled orders are excluded entirely. See the Report Guide in your dashboard for the exact formula behind every metric.",
  },
  {
    id: "profit-vs-shopify",
    category: "Profit & reports",
    question: "Why is my profit here different from Shopify's reports?",
    answer:
      "Shopify reports sales; GetProfitCalc reports profit. Shopify's numbers don't subtract your product costs, transaction fees, or ad spend, and they don't convert multi-currency orders. We subtract COGS, fees, shipping, and attributed ad spend from each order, exclude cancelled orders, and convert every order into your store currency before totalling — so the number you see is what you actually kept.",
  },
  // ── Account & security ─────────────────────────────────────────────
  {
    id: "cancel-subscription",
    category: "Account & security",
    question: "How do I cancel my subscription?",
    answer:
      "Go to Dashboard → Settings → Billing & Plan and cancel there. Your access continues until the end of the current billing period.",
  },
  {
    id: "data-protection",
    category: "Account & security",
    question: "How is my store data protected?",
    answer:
      "Your Shopify and ad-account tokens are stored AES-encrypted, and two-factor authentication is available under Dashboard → Security. We never sell your data. For data-protection details see the DPA page, and if you need your data exported or deleted, email hello@getprofitcalc.com or use Shopify's GDPR request flow for your store.",
  },
];

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  /** Same notation as the dashboard Report Guide, where one exists. */
  formula?: string;
}

/**
 * Plain-language definitions, consistent with the dashboard Report Guide
 * (src/app/(dashboard)/dashboard/report-guide/page.tsx) — same formulas,
 * same "common mistake" framing where it matters.
 */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "net-revenue",
    term: "Net revenue",
    definition:
      "What customers actually paid, after refunds. Gross revenue is tax-exclusive and already net of discounts — don't subtract discounts again.",
    formula: "grossRevenue − refundAmount − chargebackAmount",
  },
  {
    id: "gross-revenue",
    term: "Gross revenue",
    definition:
      "Total sales value before refunds and chargebacks. Already net of discounts and excluding tax collected.",
  },
  {
    id: "gross-profit",
    term: "Gross profit",
    definition:
      "Net revenue minus COGS only. It shows whether the products themselves are profitable, before shipping, fees, and ad spend.",
    formula: "netRevenue − totalCogs",
  },
  {
    id: "net-profit",
    term: "Net profit",
    definition:
      "Net revenue minus every merchant cost: COGS, shipping, transaction fees, ad spend, packaging, COD fees, RTO loss, and other costs. The bottom line.",
    formula: "netRevenue − totalCogs − shippingCost − transactionFees − adSpendAllocated − otherCosts",
  },
  {
    id: "net-margin",
    term: "Net margin",
    definition: "Net profit as a share of net revenue. The clearest single measure of how efficient each sale is.",
    formula: "netProfit / netRevenue × 100",
  },
  {
    id: "gross-margin",
    term: "Gross margin",
    definition: "Gross profit as a share of net revenue. Useful for pricing decisions; it ignores ad spend and fees.",
    formula: "grossProfit / netRevenue × 100",
  },
  {
    id: "cogs",
    term: "COGS",
    definition:
      "Cost of goods sold — what each unit cost you, from Shopify's cost field, a manual rule, CSV import, or supplier sync. Leaving COGS at 0 overstates profit.",
    formula: "sum(lineItem.cogs × quantity)",
  },
  {
    id: "aov",
    term: "Average order value (AOV)",
    definition: "Net revenue per counted order. Use net revenue (after refunds), not gross — gross overstates it.",
    formula: "netRevenue / orderCount",
  },
  {
    id: "roas",
    term: "ROAS",
    definition:
      "Return on ad spend — revenue attributed to ads divided by ad spend. Above 1x means ads return more than they cost; whether that's profitable depends on your margin.",
    formula: "attributedRevenue / adSpend",
  },
  {
    id: "roi",
    term: "ROI",
    definition:
      "Return on investment — net profit from an activity divided by what it cost. Unlike ROAS, ROI counts all costs, not just ad spend.",
    formula: "(gain − cost) / cost × 100",
  },
  {
    id: "attribution",
    term: "Attribution",
    definition:
      "How ad spend is matched to orders. Spend is allocated to orders by UTM campaign where present; unattributed spend is reported separately, never silently spread across campaigns.",
  },
  {
    id: "rto-rate",
    term: "RTO rate",
    definition:
      "Share of orders returned to origin (delivery failed). An RTO loses the shipping and packaging too, not just the sale — don't confuse it with a refund.",
    formula: "orders with rtoLoss > 0 / orderCount × 100",
  },
  {
    id: "chargeback",
    term: "Chargeback",
    definition:
      "A payment the customer's bank forcibly reverses. Like a refund, it reduces net revenue — and it usually comes with an extra bank fee.",
  },
  {
    id: "ltv",
    term: "Lifetime value (LTV)",
    definition:
      "The total net profit a customer is expected to generate across all their orders. Compare it with CAC to judge whether acquiring customers pays off.",
  },
  {
    id: "cac",
    term: "Customer acquisition cost (CAC)",
    definition:
      "Ad spend and other acquisition costs divided by the number of new customers acquired. Healthy when LTV comfortably exceeds CAC.",
    formula: "acquisitionSpend / newCustomers",
  },
  {
    id: "profit-per-visitor",
    term: "Profit per visitor",
    definition:
      "Net profit divided by distinct visitors. The single number that combines traffic and profitability — use net profit, not gross.",
    formula: "netProfit / visitors",
  },
];

/**
 * Case-insensitive search: every word in the query must appear in at least
 * one of the given fields (AND across words, OR across fields). An empty
 * query returns every entry, in order.
 */
export function searchHelpItems<T extends object>(
  items: readonly T[],
  query: string,
  fields: (keyof T)[],
): T[] {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) =>
    words.every((word) =>
      fields.some((field) => String((item[field] as unknown) ?? "").toLowerCase().includes(word)),
    ),
  );
}

export function groupFaqsByCategory(
  faqs: readonly HelpFaq[],
): { category: HelpFaqCategory; faqs: HelpFaq[] }[] {
  return HELP_FAQ_CATEGORIES.map((category) => ({
    category,
    faqs: faqs.filter((f) => f.category === category),
  })).filter((group) => group.faqs.length > 0);
}
