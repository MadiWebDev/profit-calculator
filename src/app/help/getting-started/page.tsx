import Link from "next/link";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Getting Started",
  description:
    "Connect your Shopify store, connect Meta and TikTok ad accounts, and learn to read your profit dashboard on GetProfitCalc.",
  path: "/help/getting-started",
});

function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white text-sm font-bold">
            {i + 1}
          </span>
          <div>
            <p className="font-semibold text-[var(--color-foreground)]">{step.title}</p>
            <p className="text-[var(--color-muted-foreground)]">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function GettingStartedPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Getting started</h1>
      <p className="text-[var(--color-muted-foreground)] text-lg mb-10 leading-relaxed">
        Three guides to take you from sign-up to understanding your numbers. Each takes a few minutes.
      </p>

      <div className="space-y-12 text-[var(--color-muted-foreground)] leading-relaxed">
        {/* ── 1. Connect Shopify ─────────────────────────────────────── */}
        <section id="connect-shopify" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">1. Connect your Shopify store</h2>
          <StepList
            steps={[
              {
                title: "Sign up and start your 7-day free trial",
                body: "Create your account with just your email — no credit card is required for the trial.",
              },
              {
                title: "Enter your store domain",
                body: "Onboarding asks for your Shopify domain. Type it as your-store.myshopify.com (just the store name works too — we add .myshopify.com for you).",
              },
              {
                title: "Approve the connection on Shopify",
                body: "You'll be redirected to Shopify to approve GetProfitCalc's access. We only ask for the permissions needed to read your orders.",
              },
              {
                title: "Wait for your orders to sync",
                body: "Once approved you're sent back to the dashboard and your orders start syncing. Your dashboard fills in as the sync runs — give it a few minutes for a large store.",
              },
            ]}
          />
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mt-6 mb-2">Set your COGS early</h3>
          <p className="mb-3">
            Profit is only as accurate as your costs. If a product has no cost recorded, its profit will look
            higher than it really is. Add costs from your Shopify product costs, a manual rule, or a CSV
            import — see <Link href="/dashboard/cogs-hub" className="text-[var(--color-primary)] hover:underline">COGS Hub</Link> in
            your dashboard.
          </p>
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mt-6 mb-2">No Shopify store?</h3>
          <p>
            Use the CSV import on the onboarding screen to upload historical orders instead. We provide a
            template with all the columns we expect. Plan limits apply: Starter includes 1 store and 100
            orders a month, Growth 2 stores and 1,000 orders a month, and Pro is unlimited on both.
          </p>
        </section>

        {/* ── 2. Connect ad accounts ────────────────────────────────── */}
        <section id="connect-ads" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">2. Connect your ad accounts</h2>
          <p className="mb-4">
            Ad spend is the cost most sellers forget. Connecting your ad accounts lets GetProfitCalc subtract
            real spend from each order&apos;s profit instead of guessing.
          </p>
          <StepList
            steps={[
              {
                title: "Open Dashboard → Ad Platforms",
                body: "You'll see the platforms you can connect: Meta, Google, TikTok, Pinterest, and Snapchat.",
              },
              {
                title: "Choose a platform and approve access",
                body: "Meta asks for ads_read, ads_management, and business_management. TikTok's Marketing API asks for the ad_account and report scopes. Both are read-only access to your ad accounts and their reporting data — we never run or edit your ads.",
              },
              {
                title: "Check the sync status",
                body: "Connected accounts appear on the Ad Platforms page with a sync status. If an account shows an error, use its refresh button to re-sync.",
              },
            ]}
          />
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mt-6 mb-2">How spend is matched to orders</h3>
          <p className="mb-3">
            Ad spend is allocated to orders by UTM campaign where present, so you can see which campaigns
            actually make money. Spend that can&apos;t be matched to a campaign is reported separately — never
            silently spread across campaigns.
          </p>
          <p>
            Plan limits apply: 1 ad platform on Starter, 3 on Growth, and unlimited on Pro. If TikTok
            reports that it isn&apos;t configured, the TikTok app credentials aren&apos;t set up yet —{" "}
            <Link href="/help/contact" className="text-[var(--color-primary)] hover:underline">contact support</Link>{" "}
            and we&apos;ll confirm the status.
          </p>
        </section>

        {/* ── 3. Reading your profit ────────────────────────────────── */}
        <section id="reading-profit" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">3. Reading your profit</h2>
          <p className="mb-4">
            Your dashboard answers one question: after every cost, what did you actually keep? Start with
            these numbers.
          </p>
          <div className="space-y-4">
            {[
              {
                title: "Net revenue — what customers really paid",
                body: "Gross sales minus refunds and chargebacks. Cancelled orders are excluded entirely, so this is real money, not storefront totals.",
              },
              {
                title: "Net profit — the bottom line",
                body: "Net revenue minus COGS, shipping, transaction fees, ad spend, packaging, COD fees, RTO loss, and other costs. If this is positive, the period made money.",
              },
              {
                title: "Net margin — how efficient each sale is",
                body: "Net profit as a share of net revenue. A falling margin while revenue grows usually means costs crept up — check COGS, refunds, and ad spend first.",
              },
              {
                title: "AOV and ROAS — the two levers",
                body: "Average order value tells you what each order is worth; ROAS tells you what each ad dollar returned. Raising AOV (bundles, upsells) and cutting losing campaigns are the fastest ways to lift profit.",
              },
            ].map(({ title, body }) => (
              <div key={title}>
                <p className="font-semibold text-[var(--color-foreground)]">{title}</p>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <h3 className="text-lg font-bold text-[var(--color-foreground)] mt-6 mb-2">Where to look next</h3>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li><strong className="text-[var(--color-foreground)]">Mission Control</strong> — today at a glance, and what needs doing now.</li>
            <li><strong className="text-[var(--color-foreground)]">Profit Trends</strong> — how profit moves over time.</li>
            <li><strong className="text-[var(--color-foreground)]">P&amp;L Report</strong> — the full income statement for a period.</li>
            <li><strong className="text-[var(--color-foreground)]">Report Guide</strong> (in your dashboard) — the exact formula behind every metric.</li>
            <li><strong className="text-[var(--color-foreground)]">Profit glossary</strong> — <Link href="/help/glossary" className="text-[var(--color-primary)] hover:underline">plain-language definitions</Link> of every term on your dashboard.</li>
          </ul>
          <p className="mt-6">
            Still unsure what a number means?{" "}
            <Link href="/help/contact" className="text-[var(--color-primary)] hover:underline">Ask support</Link> —
            include a screenshot of the page and we&apos;ll walk through it with you.
          </p>
        </section>
      </div>
    </div>
  );
}
