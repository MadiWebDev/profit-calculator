// Programmatic SEO landing pages for GetProfitCalc (getprofitcalc.com).
// Copy is written for GetProfitCalc's real features only: Shopify OAuth sync,
// CSV import, order-level true profit, COGS, fees, shipping, refunds, ad
// attribution (Meta/Google/TikTok via UTM), multi-store, currency and tax
// settings, COD cash flow, and scheduled reports. No competitor prices or
// features are asserted here: alternative pages compare on qualitative
// criteria and tell the reader to verify current vendor pricing, because
// vendor plans change. Printful/Printify pages are explicit that POD
// products are tracked as Shopify orders, not via a native POD integration.

export interface SeoFeature {
  title: string;
  desc: string;
}

export interface SeoFaq {
  q: string;
  a: string;
}

export interface SeoCompare {
  title: string;
  competitor: string;
  note: string;
  rows: { feature: string; us: string; them: string }[];
}

export interface SeoPage {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  features: SeoFeature[];
  steps: SeoFeature[];
  faqs: SeoFaq[];
  compare?: SeoCompare;
  related: string[];
}

const STEPS_STANDARD: SeoFeature[] = [
  { title: "Connect Shopify", desc: "Connect your store with Shopify OAuth. Orders sync automatically, and webhooks keep them up to date as they change." },
  { title: "Add your real costs", desc: "Set product COGS, shipping costs, transaction fees, and other expenses once. Historical orders can be imported by CSV." },
  { title: "See true profit per order", desc: "Every order shows revenue minus COGS, fees, shipping, discounts, and refunds, so you know exactly what you kept." },
];

const STEPS_ADS: SeoFeature[] = [
  { title: "Connect Shopify and your ad accounts", desc: "Orders sync from Shopify while ad spend is attributed through UTM tracking across Meta, Google, and TikTok." },
  { title: "Match spend to orders", desc: "Ad spend is allocated to the orders it drove, so profit is shown after advertising, not before it." },
  { title: "Cut what loses money", desc: "Sort campaigns, products, and creatives by profit after ad spend, and reallocate budget to what actually earns." },
];

const FAQ_TRIAL: SeoFaq = {
  q: "Do I need a credit card to try GetProfitCalc?",
  a: "No. You can create an account and connect your store first, and check the pricing page for current plans and trial terms before committing to a paid plan.",
};

const FAQ_SWITCH: SeoFaq = {
  q: "Can I switch from another profit tracker?",
  a: "Yes. Connect Shopify and your historical orders sync; older history can be imported by CSV. Your COGS and cost settings are entered once and then apply across reports.",
};

export const SEO_PAGES: Record<string, SeoPage> = {
  "use-cases": {
    slug: "use-cases",
    title: "Use Cases — Who GetProfitCalc Is Built For",
    description:
      "See how dropshippers, print-on-demand sellers, multi-store owners, and agencies use GetProfitCalc to track true Shopify profit after every cost.",
    eyebrow: "Use cases",
    h1: "Built for the way you actually sell on Shopify",
    intro:
      "A profit tracker is only useful if it matches your business model. GetProfitCalc is built around Shopify orders and real costs, so dropshippers, print-on-demand sellers, multi-store operators, and agencies all get profit numbers they can act on — not vanity revenue charts.",
    features: [
      { title: "Dropshipping", desc: "Thin margins leave no room for guesswork. Track product-level profit after COGS, shipping, fees, and ad spend on every order." },
      { title: "Print on demand", desc: "Your POD products sell through Shopify, so their orders, base costs, and fees flow into the same profit picture as everything else." },
      { title: "Multi-store operators", desc: "Connect multiple Shopify stores and compare profit across them instead of logging into each store separately." },
      { title: "Agencies and accountants", desc: "Client workspaces, scheduled reports, and exports make it practical to report profit to clients without building spreadsheets by hand." },
      { title: "COD and international sellers", desc: "COD cash flow, multi-currency reporting, and tax settings cover the cases where a simple revenue report misleads most." },
      { title: "Ad-driven stores", desc: "When most of your margin goes to ads, profit after ad spend — by campaign and creative — is the number that decides your budget." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "Is GetProfitCalc only for Shopify?", a: "Shopify is the native integration: OAuth connection, automatic order sync, and webhooks. Stores on other platforms can import historical orders by CSV, but live sync is Shopify-only by design." },
      { q: "Which use case benefits most?", a: "Any store where costs are spread across suppliers, shipping, fees, and ads. If you only need a revenue total, Shopify already shows that. GetProfitCalc exists for the profit underneath it." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    related: ["dropshipping-profit-tracker", "printful-profit-tracker", "multi-store-profit-tracking", "cod-profit-tracking-shopify"],
  },
  compare: {
    slug: "compare",
    title: "Compare Profit Trackers — GetProfitCalc vs the Alternatives",
    description:
      "Compare GetProfitCalc with ProfitCalc, TrueProfit, BeProfit, Sellerboard, and Profitario on the criteria that matter: order-level profit, ad attribution, and cost coverage.",
    eyebrow: "Comparison hub",
    h1: "Compare profit trackers before you commit to one",
    intro:
      "Every profit tracker promises the same headline: your true profit. The differences are in the details — which costs are included, how ad spend is attributed, and whether the numbers survive a spot check against your payouts. Use this hub to compare GetProfitCalc with the tools merchants most often evaluate alongside it.",
    features: [
      { title: "Order-level profit, not just totals", desc: "Totals hide losing products. GetProfitCalc shows profit per order and per product, so a profitable store average cannot mask unprofitable SKUs." },
      { title: "Every cost in one place", desc: "COGS, shipping, transaction fees, discounts, refunds, and ad spend are all deducted, so the headline number is profit kept, not revenue." },
      { title: "Ad profit by campaign and creative", desc: "UTM attribution across Meta, Google, and TikTok connects spend to the orders it produced, including creative-level views." },
      { title: "Reports you can send", desc: "Scheduled PDF and CSV reports, shared views, and exports mean the numbers leave the dashboard and reach clients, partners, and accountants." },
      { title: "Shopify-native, CSV for the rest", desc: "Live sync is Shopify-only by design, with CSV import for historical orders and stores on other platforms." },
      { title: "Built for teams and agencies", desc: "Team roles, client workspaces, audit logs, and an API support stores that outgrow a single-user spreadsheet." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "Which alternative is closest to GetProfitCalc?", a: "It depends on your platform and budget. The alternative pages linked below compare each tool on the same criteria, so you can judge by your own priorities rather than by marketing claims." },
      { q: "Why not just use a spreadsheet?", a: "Spreadsheets work until order volume, ad platforms, and refunds grow. The failure mode is stale data and manual fee entry. A tracker that syncs orders and costs automatically removes both." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    compare: {
      title: "GetProfitCalc at a glance",
      competitor: "Typical alternative",
      note: "Vendor plans and features change. Verify current pricing and plan limits on each vendor's site before switching.",
      rows: [
        { feature: "Shopify order sync", us: "Native OAuth + webhooks", them: "Varies by tool" },
        { feature: "Order-level true profit", us: "Yes", them: "Usually yes" },
        { feature: "Ad spend attribution", us: "Meta, Google, TikTok (UTM)", them: "Varies by tool" },
        { feature: "CSV import for history", us: "Yes", them: "Varies by tool" },
        { feature: "Scheduled PDF/CSV reports", us: "Yes", them: "Varies by plan" },
        { feature: "Free calculators hub", us: "Yes", them: "Rarely" },
      ],
    },
    related: ["trueprofit-alternative", "beprofit-alternative", "sellerboard-alternative", "profitario-alternative", "shopify-profit-tracker-vs-spreadsheet"],
  },
  "trueprofit-alternative": {
    slug: "trueprofit-alternative",
    title: "TrueProfit Alternative — GetProfitCalc",
    description:
      "Looking for a TrueProfit alternative? Compare GetProfitCalc on order-level profit, ad attribution, cost coverage, and reporting — and see why merchants switch.",
    eyebrow: "TrueProfit alternative",
    h1: "A TrueProfit alternative built around order-level profit",
    intro:
      "If you are evaluating a TrueProfit alternative, the question is rarely whether a tool can show a profit total. It is whether every cost is included, whether ad spend is tied to the orders it drove, and whether you can export and schedule the reports you actually use. GetProfitCalc is built for exactly that comparison.",
    features: [
      { title: "Profit per order and per product", desc: "Drill from store totals down to individual orders and SKUs to find the products subsidising the rest of your catalogue." },
      { title: "Ad profit after spend", desc: "Campaign and creative profit after Meta, Google, and TikTok spend, attributed with UTM data rather than blended averages." },
      { title: "Full cost coverage", desc: "COGS, shipping, transaction fees, discounts, refunds, and other fees are deducted before any headline profit figure." },
      { title: "Reports that leave the dashboard", desc: "Scheduled PDF and CSV reports plus shared views, so profit reporting does not depend on screenshots." },
      { title: "Product intelligence", desc: "Fully-loaded profit ranking, break-even price, and maximum discount per product help pricing decisions, not just reporting." },
      { title: "Guardrails and alerts", desc: "Threshold alerts on margin, refunds, and order profit warn you when a product or campaign starts losing money." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "What should I compare before switching from TrueProfit?", a: "Check four things: which costs are deducted, how ad spend is attributed, whether profit is shown per order and per product, and whether reports can be scheduled and exported. Those four decide whether the numbers are usable day to day." },
      { q: "Will my historical data carry over?", a: "Connect Shopify to sync orders, and import older history by CSV. COGS and cost settings are entered once and apply across your reports." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    compare: {
      title: "What to compare",
      competitor: "TrueProfit",
      note: "TrueProfit's plans and features change over time. Verify its current pricing and plan limits on its own site before deciding.",
      rows: [
        { feature: "Order-level profit", us: "Yes", them: "Check current plans" },
        { feature: "Profit after ad spend", us: "Meta, Google, TikTok (UTM)", them: "Check current plans" },
        { feature: "Product-level margins", us: "Yes, with break-even price", them: "Check current plans" },
        { feature: "Scheduled reports", us: "PDF + CSV", them: "Check current plans" },
        { feature: "CSV history import", us: "Yes", them: "Check current plans" },
        { feature: "Free calculators hub", us: "Yes", them: "Check current plans" },
      ],
    },
    related: ["compare", "beprofit-alternative", "shopify-profit-analytics", "shopify-profit-calculator"],
  },
  "beprofit-alternative": {
    slug: "beprofit-alternative",
    title: "BeProfit Alternative — GetProfitCalc",
    description:
      "Looking for a BeProfit alternative? See how GetProfitCalc compares on true profit calculation, ad attribution, product analytics, and reporting.",
    eyebrow: "BeProfit alternative",
    h1: "A BeProfit alternative focused on profit you can verify",
    intro:
      "Merchants shopping for a BeProfit alternative usually want the same thing: a profit number that survives a check against bank payouts. GetProfitCalc gets there by deducting every cost category it knows about, attributing ad spend to orders, and showing the work per order and per product.",
    features: [
      { title: "Verifiable profit math", desc: "Revenue minus COGS, fees, shipping, discounts, refunds, and ad spend, visible per order — so the total is the sum of its parts." },
      { title: "Product and customer views", desc: "Product intelligence ranks SKUs by fully-loaded profit, and customer views segment buyers by value and recency." },
      { title: "Ad attribution that names the ad", desc: "UTM-based attribution across Meta, Google, and TikTok, down to creative level where the data supports it." },
      { title: "Leak detection", desc: "Dedicated views surface refunds, fees, and costs that quietly eat margin, instead of burying them in a total." },
      { title: "Scheduled and shared reports", desc: "Weekly and monthly reports by PDF or CSV, plus shared views for partners and clients." },
      { title: "What-if simulator", desc: "Model price, COGS, and ad spend changes before committing to them, and see the margin effect immediately." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "How is GetProfitCalc different from BeProfit?", a: "The honest answer is that both aim at the same job. Compare them on cost coverage, attribution depth, per-order transparency, and reporting — and pick the one whose numbers you can reconcile with your payouts." },
      { q: "Can I import my BeProfit-era history?", a: "Shopify orders sync on connection, and older history can be imported by CSV. Cost settings are entered once and then apply consistently." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    compare: {
      title: "What to compare",
      competitor: "BeProfit",
      note: "BeProfit's plans and features change over time. Verify its current pricing and plan limits on its own site before deciding.",
      rows: [
        { feature: "Order-level profit", us: "Yes", them: "Check current plans" },
        { feature: "Profit after ad spend", us: "Meta, Google, TikTok (UTM)", them: "Check current plans" },
        { feature: "Product-level margins", us: "Yes, with break-even price", them: "Check current plans" },
        { feature: "Scheduled reports", us: "PDF + CSV", them: "Check current plans" },
        { feature: "Customer segmentation", us: "RFM views included", them: "Check current plans" },
        { feature: "Free calculators hub", us: "Yes", them: "Check current plans" },
      ],
    },
    related: ["compare", "trueprofit-alternative", "shopify-profit-analytics", "shopify-profit-calculator"],
  },
  "sellerboard-alternative": {
    slug: "sellerboard-alternative",
    title: "Sellerboard Alternative for Shopify — GetProfitCalc",
    description:
      "Sellerboard is built mainly for Amazon sellers. If you sell on Shopify, see why GetProfitCalc — Shopify-native profit tracking — is the closer fit.",
    eyebrow: "Sellerboard alternative",
    h1: "Selling on Shopify? You need a Shopify-native tracker",
    intro:
      "Sellerboard is well known among Amazon sellers, and that focus is exactly the issue for a Shopify store: Amazon fees, FBA logic, and marketplace payouts are not your cost structure. GetProfitCalc is Shopify-native — orders, fees, and ad attribution modelled the way a Shopify store actually incurs them.",
    features: [
      { title: "Shopify-native sync", desc: "OAuth connection, automatic order sync, and webhooks for live updates, instead of a marketplace import adapted to Shopify." },
      { title: "Shopify fee handling", desc: "Transaction fees, discounts, refunds, and shipping are deducted in the order record, matching how Shopify reports them." },
      { title: "Ad profit for DTC traffic", desc: "Meta, Google, and TikTok spend attributed to Shopify orders via UTM, which is how DTC stores actually acquire customers." },
      { title: "COD and multi-currency", desc: "Cash-on-delivery cash flow and multi-currency reporting cover selling patterns that marketplace tools rarely model well." },
      { title: "Product intelligence", desc: "Fully-loaded profit ranking and break-even price per SKU, for catalogue decisions rather than marketplace repricing." },
      { title: "CSV for everything else", desc: "Historical orders and non-Shopify sales import by CSV, so a mixed business still gets one profit picture." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "Is Sellerboard bad for Shopify?", a: "Not bad — just built for a different marketplace. If your store is on Shopify, a Shopify-native tool models your fees, payouts, and ad traffic more directly, which means fewer adjustments and fewer surprises." },
      { q: "I sell on both Amazon and Shopify. Can GetProfitCalc help?", a: "Shopify orders sync natively, and other sales can be imported by CSV. Live Amazon sync is not a GetProfitCalc feature, so judge it on the Shopify side of your business." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    compare: {
      title: "What to compare",
      competitor: "Sellerboard",
      note: "Sellerboard is primarily an Amazon tool; verify its current Shopify support and pricing on its own site before deciding.",
      rows: [
        { feature: "Primary platform", us: "Shopify-native", them: "Primarily Amazon" },
        { feature: "Shopify order sync", us: "OAuth + webhooks", them: "Check current support" },
        { feature: "Order-level profit", us: "Yes", them: "Check current plans" },
        { feature: "Ad spend attribution", us: "Meta, Google, TikTok (UTM)", them: "Check current plans" },
        { feature: "COD cash flow", us: "Yes", them: "Check current plans" },
        { feature: "Free calculators hub", us: "Yes", them: "Check current plans" },
      ],
    },
    related: ["compare", "shopify-profit-calculator", "cod-profit-tracking-shopify", "multi-currency-profit-tracking"],
  },
  "profitario-alternative": {
    slug: "profitario-alternative",
    title: "Profitario Alternative — GetProfitCalc",
    description:
      "Looking for a Profitario alternative? Compare GetProfitCalc on order-level profit, cost coverage, ad attribution, and reporting for Shopify stores.",
    eyebrow: "Profitario alternative",
    h1: "A Profitario alternative with deeper cost coverage",
    intro:
      "When merchants look for a Profitario alternative, they usually want one of two things: costs their current tool misses, or reports they can actually send to someone. GetProfitCalc covers COGS, shipping, fees, discounts, refunds, and ad spend per order, and turns the result into scheduled, shareable reports.",
    features: [
      { title: "Costs beyond COGS", desc: "Shipping, transaction fees, other fees, discounts, and refunds are all deducted — the costs that most often explain a gap between revenue and bank balance." },
      { title: "Profit by product, channel, and country", desc: "Break profit down by SKU, by store, and by customer country to see where margin is actually made." },
      { title: "Ad profit by creative", desc: "UTM attribution across Meta, Google, and TikTok, including creative-level profit where the data supports it." },
      { title: "Guardrails and alerts", desc: "Margin, refund, and order-profit thresholds alert you when something starts losing money, instead of surfacing it at month end." },
      { title: "Scheduled reports", desc: "Weekly and monthly PDF and CSV reports, plus shared views for clients and partners." },
      { title: "Agency-ready", desc: "Client workspaces, team roles, and audit logs support stores and agencies managing profit for more than one brand." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "What should I check before switching from Profitario?", a: "Reconcile one month: compare each tool's profit total against your payouts, and look at which cost categories explain any gap. Then check attribution depth and whether reports can be scheduled and exported." },
      { q: "Does switching lose my history?", a: "No. Shopify orders sync on connection and older history imports by CSV, so your reporting continues from the same order record." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    compare: {
      title: "What to compare",
      competitor: "Profitario",
      note: "Profitario's plans and features change over time. Verify its current pricing and plan limits on its own site before deciding.",
      rows: [
        { feature: "Order-level profit", us: "Yes", them: "Check current plans" },
        { feature: "Profit after ad spend", us: "Meta, Google, TikTok (UTM)", them: "Check current plans" },
        { feature: "Cost categories deducted", us: "COGS, fees, shipping, refunds, ads", them: "Check current plans" },
        { feature: "Scheduled reports", us: "PDF + CSV", them: "Check current plans" },
        { feature: "Agency workspaces", us: "Yes", them: "Check current plans" },
        { feature: "Free calculators hub", us: "Yes", them: "Check current plans" },
      ],
    },
    related: ["compare", "trueprofit-alternative", "shopify-profit-analytics", "shopify-profit-and-loss-report"],
  },
  "best-shopify-profit-tracker": {
    slug: "best-shopify-profit-tracker",
    title: "Best Shopify Profit Tracker — Why Stores Choose GetProfitCalc",
    description:
      "What makes the best Shopify profit tracker? Order-level profit, full cost coverage, ad attribution, and reports you can trust. See how GetProfitCalc measures up.",
    eyebrow: "Best Shopify profit tracker",
    h1: "The best Shopify profit tracker is the one you can reconcile",
    intro:
      "The best Shopify profit tracker is not the one with the prettiest dashboard. It is the one whose profit total matches your bank account at month end. That requires every cost deducted, ad spend attributed to orders, and profit visible per order and per product — which is how GetProfitCalc is built.",
    features: [
      { title: "Reconcile-ready totals", desc: "Profit totals are the sum of per-order profit, so any figure can be traced back to the orders behind it." },
      { title: "All costs, not a subset", desc: "COGS, shipping, transaction fees, other fees, discounts, refunds, and ad spend are deducted before the headline number." },
      { title: "Ad profit by campaign and creative", desc: "Meta, Google, and TikTok spend attributed via UTM, so budget decisions follow profit, not clicks." },
      { title: "Product intelligence", desc: "Fully-loaded profit ranking, break-even price, and maximum discount per product turn reporting into pricing decisions." },
      { title: "Alerts before month end", desc: "Guardrails on margin, refunds, and order profit flag problems while there is still time to fix them." },
      { title: "Reports for other people", desc: "Scheduled PDF and CSV reports, shared views, and exports make profit a number you can hand to a partner or accountant." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "What should I look for in a Shopify profit tracker?", a: "Four things: cost coverage, attribution depth, per-order transparency, and reporting. A tool that fails any of them will give you a total you cannot act on or verify." },
      { q: "Is GetProfitCalc the best tracker for every store?", a: "No tool is. GetProfitCalc is strongest for Shopify stores with meaningful ad spend, varied COGS, and multiple cost types. Stores that only need a revenue total already have that in Shopify." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    related: ["shopify-profit-calculator", "shopify-profit-analytics", "compare", "shopify-profit-tracker-vs-spreadsheet"],
  },
  "shopify-profit-calculator": {
    slug: "shopify-profit-calculator",
    title: "Shopify Profit Calculator — True Net Profit Per Order",
    description:
      "Calculate your true Shopify profit: revenue minus COGS, fees, shipping, discounts, refunds, and ad spend — per order and per product, automatically.",
    eyebrow: "Shopify profit calculator",
    h1: "Your Shopify profit, calculated the honest way",
    intro:
      "Shopify tells you revenue. It does not tell you profit. GetProfitCalc calculates true net profit per order by deducting COGS, transaction fees, shipping costs, discounts, refunds, and ad spend — automatically, from your synced orders, so the number you see is the number you kept.",
    features: [
      { title: "Automatic, not manual", desc: "Orders sync from Shopify, so profit is calculated continuously instead of once a month in a spreadsheet." },
      { title: "Per order and per product", desc: "See which orders and SKUs make money and which ones quietly lose it, instead of trusting a store average." },
      { title: "Break-even price", desc: "Every product shows the price at which it stops losing money, which sets a floor for discounts and promotions." },
      { title: "Maximum discount", desc: "Know how far you can discount a product before it turns unprofitable, before you launch the sale." },
      { title: "Profit over time", desc: "Daily, weekly, and monthly profit trends show whether margin is improving or eroding, and when it changed." },
      { title: "Free calculators too", desc: "Single-order and scenario calculators are available free on the site for quick checks without an account." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "How is true net profit calculated?", a: "Revenue minus product COGS, shipping costs, transaction and other fees, discounts, refunds, and allocated ad spend, per order. Totals are the sum of per-order profit, so they can always be traced back." },
      { q: "Do I have to enter COGS manually?", a: "COGS is set per product once, then applied to every order containing it. Bulk and CSV options exist for large catalogues." },
      { q: "Does it handle refunds and cancelled orders?", a: "Yes. Refunds reduce profit on the affected orders, and cancelled orders are excluded from profit totals." },
      FAQ_TRIAL,
    ],
    related: ["shopify-profit-analytics", "shopify-net-profit-tracker", "shopify-cogs-tracker", "best-shopify-profit-tracker"],
  },
  "shopify-profit-analytics": {
    slug: "shopify-profit-analytics",
    title: "Shopify Profit Analytics — Product, Channel & Customer Profit",
    description:
      "Shopify profit analytics that go beyond revenue: profit by product, country, channel, and customer segment, with trends and alerts built in.",
    eyebrow: "Shopify profit analytics",
    h1: "Analytics that answer why profit moved, not just that it did",
    intro:
      "Revenue analytics tell you what sold. Profit analytics tell you what earned. GetProfitCalc breaks profit down by product, country, store, and customer segment, compares periods, and flags the changes — so a margin drop comes with a cause, not just a chart.",
    features: [
      { title: "Profit by product", desc: "Fully-loaded profit ranking, 30-day movers, and break-even prices show which SKUs deserve more budget and which deserve a price change." },
      { title: "Profit by country and channel", desc: "See where margin is made geographically and which acquisition channels bring profitable customers, not just cheap clicks." },
      { title: "Customer value segments", desc: "RFM segmentation — champions, loyal, at-risk, and lost — shows whether profit is concentrated in a few buyers or spread safely." },
      { title: "Trends and comparisons", desc: "Period-over-period profit, margin, and cost trends make it obvious when a cost crept up or a campaign stopped paying." },
      { title: "Mission control view", desc: "One dashboard for revenue, profit, margin, ad spend, and refunds, so the day's position is visible at a glance." },
      { title: "Alerts on what matters", desc: "Threshold alerts on margin, refunds, and average order profit catch deterioration during the month, not after it." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "How is this different from Shopify analytics?", a: "Shopify analytics centre on sales and sessions. GetProfitCalc centres on profit after costs, which is a different question with different answers — a bestseller by revenue can be a loser by profit." },
      { q: "Can I compare this month with last month?", a: "Yes. Trends and period comparisons are built into the analytics views, including product movers over the last 30 days." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    related: ["shopify-profit-calculator", "shopify-profit-and-loss-report", "shopify-ad-spend-profit-tracker", "shopify-net-profit-tracker"],
  },
  "shopify-cogs-tracker": {
    slug: "shopify-cogs-tracker",
    title: "Shopify COGS Tracker — Product Costs That Stay Accurate",
    description:
      "Track Shopify COGS per product and variant, including shipping and other costs, so every profit figure in GetProfitCalc rests on costs you can trust.",
    eyebrow: "Shopify COGS tracker",
    h1: "Profit is only as accurate as your COGS",
    intro:
      "Most profit errors are COGS errors: a stale supplier price, a variant without a cost, or shipping treated as free. GetProfitCalc's COGS hub keeps product and variant costs in one place, applies them to every order automatically, and shows the profit effect of any cost change immediately.",
    features: [
      { title: "Per product and variant", desc: "Costs live at the variant level, so a size or colour with a different supplier price does not inherit the wrong cost." },
      { title: "Bulk updates", desc: "Update costs across a catalogue without editing products one by one, and see the margin impact before it hits reports." },
      { title: "Shipping and other costs", desc: "Shipping costs and other fees sit alongside COGS in the same calculation, so they cannot be forgotten in a total." },
      { title: "Cost history awareness", desc: "When a supplier price changes, current and historical orders reflect the costs that applied, keeping trend comparisons honest." },
      { title: "Margin at a glance", desc: "Every product shows margin and break-even price from its current cost, so pricing decisions start from real numbers." },
      { title: "CSV import", desc: "Large catalogues can be costed by import instead of manual entry, and historical orders can be imported the same way." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "Products and orders sync from your store, giving every SKU a place to hold its cost." },
      { title: "Set costs once", desc: "Enter COGS per product and variant, plus shipping and fee settings, in the COGS hub." },
      { title: "Profit updates everywhere", desc: "Order profit, product rankings, and P&L reports all use the same costs, so a correction fixes every view at once." },
    ],
    faqs: [
      { q: "What counts as COGS in GetProfitCalc?", a: "The direct cost of the product itself, set per product and variant. Shipping, transaction fees, and other fees are tracked as separate cost categories and deducted alongside COGS." },
      { q: "What if my supplier prices change?", a: "Update the cost in the COGS hub and the change flows into profit figures. Review product margins after any supplier change, since break-even prices move with costs." },
      { q: "Can I import COGS for hundreds of products?", a: "Yes, CSV import is supported for products and orders, which is the practical route for large catalogues." },
      FAQ_TRIAL,
    ],
    related: ["shopify-profit-calculator", "shopify-profit-and-loss-report", "dropshipping-profit-tracker", "shopify-net-profit-tracker"],
  },
  "shopify-profit-and-loss-report": {
    slug: "shopify-profit-and-loss-report",
    title: "Shopify Profit and Loss Report — P&L Without the Spreadsheet",
    description:
      "Generate a Shopify profit and loss report with revenue, COGS, fees, shipping, ad spend, and net profit — ready to share, export, and schedule.",
    eyebrow: "Shopify P&L report",
    h1: "A P&L report your accountant can actually use",
    intro:
      "A profit and loss report should reconcile: revenue, every cost category, and the net that remains, for a period you choose. GetProfitCalc builds that report from your synced orders and cost settings, and exports it as PDF or CSV — or schedules it to arrive weekly or monthly without anyone remembering to run it.",
    features: [
      { title: "Every cost category shown", desc: "Revenue, COGS, shipping, transaction and other fees, discounts, refunds, and ad spend appear as separate lines, not a single mystery deduction." },
      { title: "Any period, comparable", desc: "Run a month, a quarter, or a custom range, and compare it with the previous period to see what actually changed." },
      { title: "Per store and per product", desc: "Multi-store P&L and product breakdowns sit behind the headline, so a total can always be explained." },
      { title: "PDF and CSV exports", desc: "Send a formatted PDF to a partner or accountant, or take CSV into your own bookkeeping workflow." },
      { title: "Scheduled delivery", desc: "Weekly and monthly reports send automatically, so reporting happens even in busy weeks." },
      { title: "Shared views", desc: "Share a live view with a partner or client instead of emailing static files back and forth." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "Does the P&L match my payouts?", a: "It should come close: the report deducts the same cost categories that reduce payouts. Timing differences — refunds, payout delays, and fee settlement — can still cause small period mismatches, and the per-order detail lets you find them." },
      { q: "Can I export the P&L for my accountant?", a: "Yes, PDF and CSV exports are built in, and reports can be scheduled to arrive automatically." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    related: ["shopify-profit-calculator", "shopify-profit-analytics", "shopify-net-profit-tracker", "multi-store-profit-tracking"],
  },
  "shopify-ad-spend-profit-tracker": {
    slug: "shopify-ad-spend-profit-tracker",
    title: "Shopify Ad Spend Profit Tracker — Profit After Ads",
    description:
      "Track Shopify profit after ad spend across Meta, Google, and TikTok, by campaign and creative, so budget follows profit instead of clicks.",
    eyebrow: "Shopify ad spend profit tracker",
    h1: "Revenue after ads is a story. Profit after ads is a decision",
    intro:
      "An ad can look profitable on ROAS and still lose money once COGS, fees, and shipping are counted. GetProfitCalc attributes ad spend to the orders it drove and deducts it alongside every other cost, so each campaign and creative gets a true profit figure — and budget moves to what earns.",
    features: [
      { title: "Meta, Google, and TikTok", desc: "Spend attribution across the three platforms DTC stores use most, via UTM tracking on the orders they produce." },
      { title: "Campaign and creative profit", desc: "Profit after ad spend at campaign level, and creative level where the data supports it, instead of a blended account average." },
      { title: "True ROAS context", desc: "ROAS next to profit after all costs stops a high-ROAS, low-margin campaign from consuming budget it does not deserve." },
      { title: "Product-level ad profit", desc: "See which products stay profitable after their acquisition cost, and which only look good before ads." },
      { title: "Alerts on losing campaigns", desc: "Margin and order-profit guardrails flag campaigns that slip underwater during the month." },
      { title: "Daily rollups", desc: "Daily profit rollups keep ad decisions on fresh numbers rather than end-of-month surprises." },
    ],
    steps: STEPS_ADS,
    faqs: [
      { q: "How is ad spend attributed to orders?", a: "Through UTM parameters on the traffic that produced the order, across Meta, Google, and TikTok. Spend is then allocated to those orders and deducted alongside COGS, fees, and shipping." },
      { q: "What if I run ads outside those platforms?", a: "Spend from other sources can be recorded as costs so profit stays honest, even where automatic attribution is not available." },
      { q: "Is profit after ad spend the same as ROAS?", a: "No. ROAS is revenue divided by spend. Profit after ad spend also deducts product and fulfilment costs, which is why the two can disagree — and why profit is the safer budgeting signal." },
      FAQ_TRIAL,
    ],
    related: ["shopify-profit-analytics", "shopify-profit-calculator", "shopify-net-profit-tracker", "dropshipping-profit-tracker"],
  },
  "shopify-net-profit-tracker": {
    slug: "shopify-net-profit-tracker",
    title: "Shopify Net Profit Tracker — What You Actually Kept",
    description:
      "Track Shopify net profit after COGS, fees, shipping, discounts, refunds, and ad spend — per order, per product, and per period.",
    eyebrow: "Shopify net profit tracker",
    h1: "Net profit is the only total that pays your bills",
    intro:
      "Gross profit flatters. Revenue flatters more. Net profit is what remains after every cost of selling, and it is the figure GetProfitCalc is built to show: per order, per product, and per period, with every deduction visible so the total can be checked, not just believed.",
    features: [
      { title: "Net, not gross", desc: "COGS, fees, shipping, discounts, refunds, and ad spend are all deducted. If a cost is missing, the page says which one to add." },
      { title: "Per order transparency", desc: "Every net profit total is the sum of per-order net profit, so any figure can be drilled into and verified." },
      { title: "Margin trends", desc: "Net margin over time shows whether the business is getting more or less profitable, independent of revenue growth." },
      { title: "Refunds handled properly", desc: "Refunds reduce net profit on the orders they belong to, instead of appearing as a separate unexplained adjustment." },
      { title: "Store and product splits", desc: "Net profit by store, product, and country prevents a strong segment from hiding a weak one." },
      { title: "Scheduled net reports", desc: "Weekly and monthly net profit reports by PDF or CSV keep owners, partners, and accountants on the same number." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "What is the difference between gross and net profit here?", a: "Gross profit is revenue minus COGS. Net profit additionally deducts shipping, transaction and other fees, discounts, refunds, and ad spend. GetProfitCalc's headline is net profit." },
      { q: "Why does my net profit differ from Shopify's reports?", a: "Shopify reports sales and payouts, not profit after your product, shipping, and advertising costs. Those costs live outside Shopify's totals, which is exactly the gap a net profit tracker closes." },
      FAQ_TRIAL,
      FAQ_SWITCH,
    ],
    related: ["shopify-profit-calculator", "shopify-profit-and-loss-report", "shopify-profit-analytics", "shopify-cogs-tracker"],
  },
  "shopify-profit-tracker-vs-spreadsheet": {
    slug: "shopify-profit-tracker-vs-spreadsheet",
    title: "Profit Tracker vs Spreadsheet — Why Automation Wins",
    description:
      "Spreadsheet vs profit tracker for Shopify: compare accuracy, time, ad attribution, and reporting, and see when it is time to switch.",
    eyebrow: "Tracker vs spreadsheet",
    h1: "Spreadsheets work — until they quietly stop working",
    intro:
      "A spreadsheet profit tracker is how most stores start, and it is a reasonable start. It breaks in predictable ways: stale data, manual fee entry, ad spend pasted from three platforms, and a formula nobody remembers writing. A dedicated tracker removes those failure modes by syncing orders and costs automatically.",
    features: [
      { title: "Always current", desc: "Orders sync via Shopify and webhooks, so today's profit is today's profit, not last month's export." },
      { title: "No formula risk", desc: "Profit math lives in tested code with per-order detail, not in a cell formula that breaks when a row is inserted." },
      { title: "Ad spend included properly", desc: "UTM attribution connects spend to orders. In a spreadsheet, that join is manual, error-prone, and usually skipped." },
      { title: "Refunds and fees handled", desc: "Refunds, discounts, and transaction fees update the affected orders automatically instead of waiting for a manual correction." },
      { title: "Reports without rebuilding", desc: "P&L, product, and scheduled reports generate from the same data, instead of a new pivot table every month." },
      { title: "Collaboration without version chaos", desc: "Team roles, shared views, and exports replace the five conflicting copies of the same spreadsheet." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "When should I switch from a spreadsheet?", a: "When any of these are true: order volume makes manual entry slow, ad spend spans multiple platforms, refunds are frequent, or more than one person needs the numbers. Any one of them is enough." },
      { q: "Can I keep my spreadsheet history?", a: "Yes. Historical orders import by CSV, so switching does not mean losing the record you already built." },
      { q: "Is a tracker worth it for a small store?", a: "For very low volume, a spreadsheet may still be fine. The case for a tracker strengthens with volume, ad spend, and catalogue size — and the free calculators cover quick one-off checks either way." },
      FAQ_TRIAL,
    ],
    compare: {
      title: "Tracker vs spreadsheet",
      competitor: "Spreadsheet",
      note: "Spreadsheets remain a legitimate choice at low volume. The comparison below is about what breaks as a store grows.",
      rows: [
        { feature: "Order sync", us: "Automatic (Shopify + webhooks)", them: "Manual export and paste" },
        { feature: "Ad attribution", us: "UTM, by campaign and creative", them: "Manual, usually skipped" },
        { feature: "Refund handling", us: "Automatic per order", them: "Manual correction" },
        { feature: "Scheduled reports", us: "PDF + CSV, automatic", them: "Rebuilt each period" },
        { feature: "Formula risk", us: "Tested calculation engine", them: "Breaks on row edits" },
        { feature: "Collaboration", us: "Roles + shared views", them: "Conflicting file copies" },
      ],
    },
    related: ["shopify-profit-calculator", "best-shopify-profit-tracker", "compare", "shopify-profit-analytics"],
  },
  "dropshipping-profit-tracker": {
    slug: "dropshipping-profit-tracker",
    title: "Dropshipping Profit Tracker — Margins You Can Trust",
    description:
      "Track dropshipping profit per order and per product on Shopify: supplier COGS, shipping, fees, refunds, and ad spend deducted automatically.",
    eyebrow: "Dropshipping profit tracker",
    h1: "Dropshipping margins are thin. Your profit math cannot be vague",
    intro:
      "Dropshipping lives or dies on a few points of margin, and those points disappear into supplier costs, shipping, fees, and ad spend. GetProfitCalc tracks profit per order and per product after all of them, so you know which products and campaigns earn their keep and which ones only generate revenue.",
    features: [
      { title: "Supplier COGS per product", desc: "Set the cost you actually pay per product and variant, and profit updates across every order containing it." },
      { title: "Shipping included", desc: "Shipping costs — yours and your supplier's, as recorded — are deducted instead of treated as free." },
      { title: "Ad profit per product", desc: "UTM attribution shows which products stay profitable after Meta, Google, and TikTok spend, not just which ones sell." },
      { title: "Refund and dispute visibility", desc: "Refunds reduce profit on the right orders, and guardrails flag refund rates that threaten margin." },
      { title: "Break-even and max discount", desc: "Every product shows its break-even price and safe discount ceiling, which matters most when testing new suppliers." },
      { title: "30-day movers", desc: "Product movers over the last 30 days show which winners are fading and which tests are working, while there is time to act." },
    ],
    steps: STEPS_STANDARD,
    faqs: [
      { q: "Does GetProfitCalc connect to my supplier?", a: "No native supplier integration is claimed. You set product COGS in GetProfitCalc, orders sync from Shopify, and profit is calculated from those two sources plus fees, shipping, and ad spend." },
      { q: "How do I handle products with changing supplier prices?", a: "Update the product cost in the COGS hub. Margins and break-even prices update with it, so a supplier change shows up in profit immediately." },
      { q: "Is this useful for a single-product store?", a: "Yes, especially then: with one product, ad profit per campaign and the break-even price are the two numbers that decide whether scaling is safe." },
      FAQ_TRIAL,
    ],
    related: ["shopify-profit-calculator", "shopify-ad-spend-profit-tracker", "printful-profit-tracker", "shopify-cogs-tracker"],
  },
  "printful-profit-tracker": {
    slug: "printful-profit-tracker",
    title: "Printful Profit Tracker for Shopify — POD Profit Per Order",
    description:
      "Track profit on Printful products sold through Shopify: base costs as COGS, Shopify fees, shipping, discounts, and ad spend, per order.",
    eyebrow: "Printful profit tracker",
    h1: "Printful profit, tracked where the sale happens: Shopify",
    intro:
      "Printful products reach customers through your Shopify store, so that is where their profit should be tracked. GetProfitCalc syncs those Shopify orders, applies the product base cost you set as COGS, deducts Shopify fees, shipping, discounts, and ad spend, and shows profit per order and per design.",
    features: [
      { title: "Base cost as COGS", desc: "Enter each product's Printful base cost once as its COGS, and every Shopify order for it calculates profit correctly." },
      { title: "Profit per design", desc: "Rank designs by fully-loaded profit, not just sales, so you promote the artwork that earns and retire the rest." },
      { title: "Fees and shipping deducted", desc: "Shopify transaction fees, shipping costs, and discounts are deducted alongside base cost, so margins are not overstated." },
      { title: "Ad profit per design", desc: "UTM attribution ties Meta, Google, and TikTok spend to the orders it produced, by product as well as by campaign." },
      { title: "Break-even pricing", desc: "See the minimum price each design needs to stay profitable, which sets sane prices for new drops." },
      { title: "Scheduled reports", desc: "Weekly and monthly profit reports by PDF or CSV keep POD performance visible without manual tallies." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "Your store's orders — including Printful products sold through it — sync automatically." },
      { title: "Set base costs as COGS", desc: "Enter each product's Printful base cost in the COGS hub, per product and variant." },
      { title: "See profit per design", desc: "Order and product profit now reflect base cost, fees, shipping, and ad spend together." },
    ],
    faqs: [
      { q: "Does GetProfitCalc integrate directly with Printful?", a: "No. Printful products are tracked as Shopify orders: they sync from Shopify, and you set their Printful base cost as COGS. There is no native Printful API sync, and this page does not claim one." },
      { q: "How do I handle different base costs per variant?", a: "COGS is set per product variant, so a hoodie and a tee, or different print areas with different base costs, each carry their own cost." },
      { q: "What about Printful shipping fees?", a: "Record shipping costs in GetProfitCalc's cost settings so they are deducted alongside base cost and platform fees." },
      FAQ_TRIAL,
    ],
    related: ["printify-profit-tracker", "dropshipping-profit-tracker", "shopify-profit-calculator", "shopify-cogs-tracker"],
  },
  "printify-profit-tracker": {
    slug: "printify-profit-tracker",
    title: "Printify Profit Tracker for Shopify — POD Profit Per Order",
    description:
      "Track profit on Printify products sold through Shopify: base costs as COGS, Shopify fees, shipping, discounts, and ad spend, per order.",
    eyebrow: "Printify profit tracker",
    h1: "Printify profit, tracked where the sale happens: Shopify",
    intro:
      "Printify products reach customers through your Shopify store, so that is where their profit should be tracked. GetProfitCalc syncs those Shopify orders, applies the product base cost you set as COGS, deducts Shopify fees, shipping, discounts, and ad spend, and shows profit per order and per design.",
    features: [
      { title: "Base cost as COGS", desc: "Enter each product's Printify base cost once as its COGS, and every Shopify order for it calculates profit correctly." },
      { title: "Profit per design and provider", desc: "Compare designs — and, where base costs differ, providers — by fully-loaded profit rather than by sales alone." },
      { title: "Fees and shipping deducted", desc: "Shopify transaction fees, shipping costs, and discounts are deducted alongside base cost, so margins are not overstated." },
      { title: "Ad profit per design", desc: "UTM attribution ties Meta, Google, and TikTok spend to the orders it produced, by product as well as by campaign." },
      { title: "Break-even pricing", desc: "See the minimum price each design needs to stay profitable before launching it at a sale price." },
      { title: "Scheduled reports", desc: "Weekly and monthly profit reports by PDF or CSV keep POD performance visible without manual tallies." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "Your store's orders — including Printify products sold through it — sync automatically." },
      { title: "Set base costs as COGS", desc: "Enter each product's Printify base cost in the COGS hub, per product and variant." },
      { title: "See profit per design", desc: "Order and product profit now reflect base cost, fees, shipping, and ad spend together." },
    ],
    faqs: [
      { q: "Does GetProfitCalc integrate directly with Printify?", a: "No. Printify products are tracked as Shopify orders: they sync from Shopify, and you set their Printify base cost as COGS. There is no native Printify API sync, and this page does not claim one." },
      { q: "My Printify costs vary by provider. How is that handled?", a: "COGS is set per product variant, so different provider costs for different variants are each recorded at their own value." },
      { q: "Can I compare designs by profit?", a: "Yes. Product profit rankings show fully-loaded profit per design, which is the right basis for deciding what to promote or retire." },
      FAQ_TRIAL,
    ],
    related: ["printful-profit-tracker", "dropshipping-profit-tracker", "shopify-profit-calculator", "shopify-cogs-tracker"],
  },
  "multi-store-profit-tracking": {
    slug: "multi-store-profit-tracking",
    title: "Multi-Store Profit Tracking — All Your Shopify Stores, One View",
    description:
      "Track profit across multiple Shopify stores in one dashboard: per-store profit, combined totals, and product performance across brands.",
    eyebrow: "Multi-store profit tracking",
    h1: "One profit picture across every store you run",
    intro:
      "Running several Shopify stores means logging into each one to answer a simple question: are we profitable? GetProfitCalc connects multiple stores, shows profit per store and combined, and lets you compare products and campaigns across brands without merging spreadsheets.",
    features: [
      { title: "Per-store profit", desc: "Each connected store reports its own revenue, costs, and net profit, so a strong store cannot hide a weak one." },
      { title: "Combined totals", desc: "A portfolio total across stores answers the owner's question directly, with the per-store breakdown one click away." },
      { title: "Cross-store product views", desc: "Compare the same or similar products across stores to see where a price, supplier, or campaign performs best." },
      { title: "Store-level P&L", desc: "Each store gets its own P&L lines — revenue, COGS, fees, shipping, ads, net — for clean per-brand reporting." },
      { title: "Team access per store", desc: "Team roles control who sees which stores, which matters the moment staff or agencies touch more than one brand." },
      { title: "Scheduled multi-store reports", desc: "Weekly and monthly reports cover the portfolio or a single store, by PDF or CSV." },
    ],
    steps: [
      { title: "Connect each Shopify store", desc: "Connect stores one by one with Shopify OAuth. Each store's orders sync independently." },
      { title: "Set costs per store", desc: "COGS, shipping, and fee settings are per store, since different brands rarely share the same cost structure." },
      { title: "Compare in one dashboard", desc: "Switch between per-store and combined views, and run P&L reports per store or across the portfolio." },
    ],
    faqs: [
      { q: "How many stores can I connect?", a: "Multiple stores are supported; check the pricing page for current plan limits on connected stores." },
      { q: "Do stores share products or costs?", a: "No. Products, COGS, and cost settings are per store, so different brands with different suppliers stay correctly separated." },
      { q: "Can my team see only their store?", a: "Team roles and permissions control store access, which is designed for exactly that situation." },
      FAQ_TRIAL,
    ],
    related: ["shopify-profit-and-loss-report", "shopify-profit-analytics", "multi-currency-profit-tracking", "use-cases"],
  },
  "multi-currency-profit-tracking": {
    slug: "multi-currency-profit-tracking",
    title: "Multi-Currency Profit Tracking — Profit in One Currency",
    description:
      "Sell in many currencies, read profit in one: GetProfitCalc converts multi-currency Shopify sales into a single reporting currency for true profit.",
    eyebrow: "Multi-currency profit tracking",
    h1: "Sell worldwide. Read profit in one currency",
    intro:
      "Selling in euros, pounds, and dollars at once makes revenue totals meaningless until they share a currency. GetProfitCalc's currency settings bring multi-currency Shopify sales into a single reporting currency, so profit, margin, and trends are comparable across markets instead of a pile of incompatible totals.",
    features: [
      { title: "Single reporting currency", desc: "All sales convert into your chosen reporting currency, so a month's profit is one number, not five." },
      { title: "Profit by country", desc: "Country profit views show which markets earn after local costs, fees, and ad spend — not just which ones sell most." },
      { title: "Consistent trends", desc: "Trends in one currency stay comparable month to month, instead of moving with exchange rates and mix shifts together." },
      { title: "Per-order transparency", desc: "Converted order profit remains traceable to the original order, so a surprising total can be investigated, not just accepted." },
      { title: "Multi-store and multi-currency together", desc: "Stores selling in different currencies roll up into the same portfolio profit picture." },
      { title: "Exports in reporting currency", desc: "PDF and CSV reports use the reporting currency, which keeps accountants and partners on the same figures." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "Orders sync with their original sale currency attached, whatever the customer paid in." },
      { title: "Choose a reporting currency", desc: "Set your reporting currency in currency settings. Sales convert into it for all profit views." },
      { title: "Read profit by market", desc: "Use country and store views to see which markets earn, and trend views to see whether that is improving." },
    ],
    faqs: [
      { q: "Which currency is profit reported in?", a: "Your chosen reporting currency, set in currency settings. Original sale currencies are preserved on the orders behind the totals." },
      { q: "Does conversion change my historical profit?", a: "Historical figures use the conversion that applied when they were recorded, so trend comparisons are not rewritten by later rate moves." },
      { q: "What about currency conversion fees?", a: "Record conversion and payment fees in your fee settings so they are deducted alongside transaction fees in profit." },
      FAQ_TRIAL,
    ],
    related: ["multi-store-profit-tracking", "vat-shopify-profit-tracking", "shopify-profit-analytics", "shopify-profit-and-loss-report"],
  },
  "vat-shopify-profit-tracking": {
    slug: "vat-shopify-profit-tracking",
    title: "VAT & Shopify Profit Tracking — Profit After Tax",
    description:
      "Track Shopify profit with VAT and tax handled properly: tax settings, tax set-aside estimates, and P&L that does not mistake tax collected for profit.",
    eyebrow: "VAT profit tracking",
    h1: "VAT collected is not profit. Your tracker should know that",
    intro:
      "For VAT-registered sellers, the most common profit error is counting tax collected as revenue kept. GetProfitCalc's tax settings and tax set-aside estimates separate what you owe from what you earned, so net profit is profit after tax obligations — not a figure that quietly includes the taxman's share.",
    features: [
      { title: "Tax settings per store", desc: "Configure tax handling per store to match how you sell, including different treatment across markets." },
      { title: "Tax set-aside estimates", desc: "Estimates show how much of current takings should be set aside for tax, so a strong month does not become a shortfall later." },
      { title: "P&L that separates tax", desc: "Profit and loss views keep tax distinct from profit, so the net figure is genuinely yours." },
      { title: "Country profit views", desc: "Profit by customer country helps identify where tax complexity and margin interact, market by market." },
      { title: "Exports for your accountant", desc: "PDF and CSV exports carry the same separated figures, so handover to an accountant does not require rework." },
      { title: "Refunds and tax together", desc: "Refunds reduce profit and the related tax picture on the affected orders, keeping both consistent." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "Orders sync with their tax lines, so tax is visible from the start rather than reconstructed later." },
      { title: "Configure tax settings", desc: "Set tax handling per store in tax settings, and review the set-aside estimate for the current period." },
      { title: "Read profit after tax", desc: "P&L and product views now show profit net of tax obligations, alongside the set-aside figure." },
    ],
    faqs: [
      { q: "Is GetProfitCalc a tax filing tool?", a: "No. It tracks profit with tax separated and estimated for set-aside purposes. Filing and formal VAT returns remain work for you or your accountant, using the exported figures." },
      { q: "Does it handle different VAT rates by country?", a: "Tax is recorded per order from Shopify's tax lines, and country views let you inspect profit market by market. Complex multi-rate situations should be confirmed with your accountant." },
      { q: "What is the tax set-aside estimate?", a: "An estimate of the tax portion of current takings that should be reserved rather than spent, so cash flow planning reflects obligations as well as profit." },
      FAQ_TRIAL,
    ],
    related: ["multi-currency-profit-tracking", "shopify-profit-and-loss-report", "shopify-net-profit-tracker", "multi-store-profit-tracking"],
  },
  "cod-profit-tracking-shopify": {
    slug: "cod-profit-tracking-shopify",
    title: "COD Profit Tracking for Shopify — Cash on Delivery, Counted Right",
    description:
      "Track cash-on-delivery profit on Shopify: COD cash flow, collection status, fees, refunds, and returns, so COD sales count only when the cash lands.",
    eyebrow: "COD profit tracking",
    h1: "COD revenue is a promise. COD profit is cash collected",
    intro:
      "Cash on delivery breaks naive profit math: an order can be delivered, returned, or never collected, and each outcome means something different for profit. GetProfitCalc's COD cash flow and courier views track COD orders through collection, so profit counts cash that arrived — not orders that were merely placed.",
    features: [
      { title: "COD cash flow view", desc: "See COD cash expected, collected, and outstanding, so cash planning reflects reality instead of order totals." },
      { title: "Collection-aware profit", desc: "Uncollected and returned COD orders do not inflate profit the way a shipped-equals-sold report would." },
      { title: "Courier and shipment tracking", desc: "Courier and shipment views connect fulfilment status to orders, which is where COD outcomes are decided." },
      { title: "Returns and refunds handled", desc: "Returned COD orders and refunds reduce profit on the right orders, keeping product margins honest." },
      { title: "Fees deducted", desc: "COD-related fees sit alongside transaction fees in the same calculation, so they cannot hide in a total." },
      { title: "WhatsApp and email updates", desc: "COD tracking notifications keep customers and teams informed, reducing failed deliveries that cost margin." },
    ],
    steps: [
      { title: "Connect Shopify", desc: "COD orders sync like any Shopify order, with payment method visible for cash-flow views." },
      { title: "Track collection", desc: "Use COD cash flow and shipment views to follow orders from placement through collection or return." },
      { title: "Read collected profit", desc: "Profit views reflect collected COD outcomes, so the headline is cash-backed, not order-count-backed." },
    ],
    faqs: [
      { q: "How is COD profit different from prepaid profit?", a: "Prepaid profit is settled at order time. COD profit depends on collection: delivered-and-paid, returned, and never-collected orders have different profit outcomes, and GetProfitCalc models that distinction." },
      { q: "What happens to a returned COD order?", a: "It reduces profit on that order and appears in returns views, so product margins reflect the return rate instead of hiding it." },
      { q: "Do COD fees get deducted?", a: "Yes, where recorded in fee settings, COD-related fees are deducted alongside other transaction fees in profit." },
      FAQ_TRIAL,
    ],
    related: ["multi-store-profit-tracking", "shopify-profit-calculator", "shopify-net-profit-tracker", "use-cases"],
  },
};
