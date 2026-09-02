import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Clock, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { AdSlot } from "@/components/AdSlot";
import { Button } from "@/components/ui/button";
import { calculators } from "@/config/calculators";
import { CalculatorCard } from "@/components/CalculatorCard";

// Static blog post data — replace with MDX/CMS integration as the site grows
interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
  tags: string[];
  content: string;
  relatedCalcSlugs?: string[];
}

const posts: BlogPost[] = [
  {
    slug: "how-to-price-products-for-30-percent-margin",
    title: "How to Price Products for a 30% Profit Margin (With Examples)",
    description: "A step-by-step guide to pricing products for a 30% net profit margin, including all fees, ad spend, and platform costs.",
    date: "2026-08-15",
    readTime: "7 min",
    tags: ["Pricing", "Profit Margin"],
    relatedCalcSlugs: ["shopify-profit", "profit-margin", "dropshipping-profit"],
    content: `
## Why 30% Is the Target

A 30% net profit margin is the sweet spot for most ecommerce businesses. It's high enough to absorb unexpected costs — a slow ad month, a supplier price increase, a returns spike — while still providing meaningful income. Below 15%, you're running on thin ice. Above 40%, you're likely pricing yourself out of the market or ignoring real costs.

The key word is **net**. Gross margin (revenue minus product cost) is not your real margin. Net margin is what's left after every single cost: product, shipping, platform fees, payment processing, advertising, returns, and overhead.

## The Pricing Formula

To hit a 30% net margin, you need to work backwards from your target:

\`\`\`
Required Selling Price = Total Costs ÷ (1 - Target Margin %)
\`\`\`

So if your total costs per unit (COGS + shipping + fees + ad spend) are $21:

\`\`\`
Required Price = $21 ÷ (1 - 0.30) = $21 ÷ 0.70 = $30
\`\`\`

## Step 1: Calculate Your True Cost Per Unit

Most sellers undercount their costs. Here's every cost you need to include:

- **Product cost (COGS):** What you pay your supplier, manufacturer, or print-on-demand service.
- **Shipping to customer:** The actual fulfillment cost per order.
- **Platform fee:** Shopify 0.5–2%, WooCommerce hosting, Etsy 6.5%.
- **Payment processing:** Stripe/PayPal 2.9% + $0.30 per transaction.
- **Ad spend per unit:** Your total ad spend divided by units sold in the same period.
- **Returns/refunds:** Multiply your refund rate by the selling price and add it as a cost.
- **Overhead allocation:** Monthly fixed costs (software, VA, tools) divided by monthly units sold.

## Step 2: Apply the Formula

Say you're selling a product on Shopify. Your costs are:
- Product: $8.00
- Shipping: $4.50
- Shopify + Stripe fees (combined ~5%): $1.50 (on a $30 item)
- Ad spend per unit: $5.00
- Returns (3% of $30): $0.90

**Total costs = $8 + $4.50 + $1.50 + $5 + $0.90 = $19.90**

For a 30% margin: $19.90 ÷ 0.70 = **$28.43**

Round up to **$29.99** for a clean price point — and your margin at this price is actually slightly above 30%.

## Step 3: Validate Against Your Market

Once you have your minimum price for a 30% margin, compare it to the market:

- If your price is **competitive or below** market rates: great — you have room to either go higher for better margin, or stay put with a strong value proposition.
- If your price is **above market**: your costs are too high. Renegotiate with suppliers, cut shipping costs, or reduce ad spend through better targeting.
- If there's no way to hit 30% at a competitive price: the product is wrong. Move on.

## Common Mistakes

**Ignoring ad spend:** This is the #1 mistake. A 50% gross margin becomes a 10% net margin when you add $15 in ad costs to a $30 product.

**Using revenue not units:** Tracking total margin % without per-unit analysis hides losing SKUs inside your average.

**Forgetting payment fees:** $0.30 per transaction sounds tiny. At 500 orders/month, that's $150/month in fees alone — before the 2.9%.

## Use the Calculator

Rather than doing this manually, use our [Profit Margin Calculator](/calculators/profit-margin) or [Shopify Profit Calculator](/calculators/shopify-profit) to enter your exact numbers and instantly see whether you're hitting your 30% target.
    `.trim(),
  },
  {
    slug: "shopify-profit-margin-guide",
    title: "The Complete Guide to Shopify Profit Margins in 2026",
    description: "Every fee Shopify sellers pay — transaction fees, payment processing, shipping, and ads — and how to calculate your real net margin.",
    date: "2026-08-10",
    readTime: "9 min",
    tags: ["Shopify", "Ecommerce"],
    relatedCalcSlugs: ["shopify-profit", "meta-ads-roas", "profit-margin"],
    content: `
## The Hidden Cost of Selling on Shopify

Shopify makes it easy to start selling. It does not make it easy to understand where all your money goes. Between Shopify's own fees, your payment processor, shipping carriers, advertising platforms, and product costs, sellers often discover their "40% margin" product actually nets them 8–12%.

This guide breaks down every fee layer, with real numbers.

## Shopify Plan Fees

Your Shopify plan affects your transaction fee:

| Plan | Monthly Cost | Transaction Fee (non-Shopify Payments) |
|------|-------------|----------------------------------------|
| Basic | $29 | 2.0% |
| Shopify | $79 | 1.0% |
| Advanced | $299 | 0.5% |

**Key insight:** If you use Shopify Payments, the transaction fee is $0 on all plans. You only pay credit card processing rates (2.4–2.9% + $0.30 depending on your plan). If you use Stripe, PayPal, or another gateway, you pay both the gateway fee AND Shopify's transaction fee.

## Payment Processing Fees

Using Shopify Payments (Basic plan): **2.9% + $0.30** per transaction.

Using Stripe + Shopify Basic: **2.9% + $0.30** (Stripe) + **2%** (Shopify transaction fee) = effectively **4.9% + $0.30**.

On a $50 sale, the difference is $1.00 vs $2.75. At 200 orders/month, that's $350/month extra in fees just by not using Shopify Payments.

## Shipping Costs

Shipping is often the most underestimated variable. Factors include:

- **Package weight and dimensions:** Dimensional weight pricing applies on most carriers.
- **Destination:** Domestic vs. international rates differ dramatically.
- **Speed:** Standard vs. expedited shipping.
- **Carrier:** USPS, UPS, FedEx, DHL each have different rate structures.

Always calculate shipping at the actual carrier rate for your typical package, not an estimate. Use real carrier rates in your profit calculations.

## Advertising Costs

The most significant variable cost for most Shopify stores. Your ad spend per unit sold is:

\`\`\`
Ad Spend Per Unit = Total Ad Spend ÷ Units Sold (Same Period)
\`\`\`

A store spending $2,000/month on ads and selling 250 units has an $8 ad cost per unit. Add this to your cost stack before calculating margin.

## A Real Worked Example

Product cost: $10. Selling price: $45. Shipping: $5.50. Shopify Basic + Stripe: 4.9% + $0.30 = $2.51. Ad spend: $9/unit.

Total costs: $10 + $5.50 + $2.51 + $9 = **$27.01**
Net profit: $45 – $27.01 = **$17.99**
Net margin: $17.99 ÷ $45 = **40%**

This is a healthy margin. But remove the ad spend from the calculation (a common mistake) and you'd think your margin is 60%. That $9/unit ad cost is the difference between a great business and an unsustainable one.

## Benchmarks

- Below 15% net margin: High risk. Small disruptions eliminate all profit.
- 15–25%: Acceptable for high-volume, low-ticket stores.
- 25–40%: Healthy and scalable.
- 40%+: Excellent — indicates either high-margin products or very efficient operations.

Use the [Shopify Profit Calculator](/calculators/shopify-profit) to get your exact margin with your actual numbers.
    `.trim(),
  },
];

function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}

export async function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return buildMetadata({ title: post.title, description: post.description, path: `/blog/${slug}` });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const relatedCalcs = (post.relatedCalcSlugs ?? [])
    .map((s) => calculators.find((c) => c.slug === s))
    .filter(Boolean) as typeof calculators;

  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Simple markdown → HTML (headings, bold, code blocks, paragraphs)
  function renderMarkdown(md: string) {
    return md
      .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-[var(--color-foreground)] mt-10 mb-4">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-[var(--color-foreground)] mt-8 mb-3">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--color-foreground)]">$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--color-primary)] hover:underline">$1</a>')
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.replace(/```[a-z]*/g, "").replace(/```/g, "").trim();
        return `<pre class="rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)] p-4 text-sm font-mono overflow-x-auto my-4"><code>${code}</code></pre>`;
      })
      .replace(/`([^`]+)`/g, '<code class="bg-[var(--color-muted)] px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/^\| .+ \|$/gm, (line) => line)  // tables pass-through
      .replace(/^(?!<[h|p|u|o|l|p|t|d|b|c])[^\n]+$/gm, (line) => {
        if (line.trim() === "") return "";
        return `<p class="text-[var(--color-muted-foreground)] leading-relaxed mb-4">${line}</p>`;
      });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)]">
          <li><Link href="/" className="hover:text-[var(--color-foreground)]">Home</Link></li>
          <li><ChevronRight className="h-3.5 w-3.5" /></li>
          <li><Link href="/blog" className="hover:text-[var(--color-foreground)]">Blog</Link></li>
          <li><ChevronRight className="h-3.5 w-3.5" /></li>
          <li className="text-[var(--color-foreground)] font-medium truncate max-w-[200px]">{post.title}</li>
        </ol>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.map((tag) => (
            <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--color-foreground)] leading-tight mb-4">
          {post.title}
        </h1>
        <div className="flex items-center gap-4 text-sm text-[var(--color-muted-foreground)]">
          <time dateTime={post.date}>{formattedDate}</time>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {post.readTime} read
          </span>
        </div>
      </header>

      {/* Content */}
      <article
        className="prose-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
      />

      {/* Mid-article ad */}
      <div className="flex justify-center my-10">
        <AdSlot position="rectangle" />
      </div>

      {/* Related calculators */}
      {relatedCalcs.length > 0 && (
        <section className="mt-10 pt-8 border-t border-[var(--color-border)]">
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-5">
            Try These Free Calculators
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedCalcs.map((calc) => (
              <CalculatorCard key={calc.slug} config={calc} />
            ))}
          </div>
        </section>
      )}

      {/* Back link */}
      <div className="mt-10 pt-6 border-t border-[var(--color-border)]">
        <Button asChild variant="outline" size="sm">
          <Link href="/blog">
            <ArrowLeft className="h-4 w-4" /> Back to Blog
          </Link>
        </Button>
      </div>
    </div>
  );
}
