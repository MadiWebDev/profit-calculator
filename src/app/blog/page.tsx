import Link from "next/link";
import { ArrowRight, Clock, Tag } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { AdSlot } from "@/components/AdSlot";
import { Badge } from "@/components/ui/badge";

export const metadata = buildMetadata({
  title: "Ecommerce Profit & Marketing Blog",
  description:
    "Actionable guides on profit margins, ROI, Facebook Ads, Shopify pricing, dropshipping, Amazon FBA, and more for ecommerce sellers and marketers.",
  path: "/blog",
});

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  featured?: boolean;
}

const posts: BlogPost[] = [
  {
    slug: "how-to-price-products-for-30-percent-margin",
    title: "How to Price Products for a 30% Profit Margin (With Examples)",
    excerpt:
      "Most sellers set prices by gut feel or copying competitors — and then wonder why they're not profitable. Here's the math-first approach to pricing that guarantees your target margin.",
    date: "2026-08-15",
    readTime: "7 min",
    tags: ["Pricing", "Profit Margin"],
    featured: true,
  },
  {
    slug: "shopify-profit-margin-guide",
    title: "The Complete Guide to Shopify Profit Margins in 2026",
    excerpt:
      "Shopify fees, payment processing, ad spend, shipping — every cost erodes your margin. Here's a complete breakdown of every fee Shopify sellers pay and how to protect your margins.",
    date: "2026-08-10",
    readTime: "9 min",
    tags: ["Shopify", "Ecommerce"],
    featured: true,
  },
  {
    slug: "facebook-ads-roas-guide",
    title: "What Is a Good ROAS for Facebook Ads? (The Real Answer)",
    excerpt:
      "The honest answer is: it depends on your margins. A 4x ROAS with 20% net margins is unprofitable. Here's how to calculate your break-even ROAS and what to target.",
    date: "2026-08-05",
    readTime: "6 min",
    tags: ["Facebook Ads", "ROAS"],
  },
  {
    slug: "amazon-fba-profit-margins-explained",
    title: "Amazon FBA Profit Margins: What Fees Are Eating Your Profit?",
    excerpt:
      "Referral fees, FBA fulfillment fees, storage fees, PPC — Amazon takes a significant cut from every sale. Here's a full breakdown with a real worked example.",
    date: "2026-07-28",
    readTime: "8 min",
    tags: ["Amazon FBA", "Fees"],
  },
  {
    slug: "dropshipping-profit-calculator-guide",
    title: "How to Calculate Dropshipping Profit (Step-by-Step)",
    excerpt:
      "Supplier cost, shipping, platform fees, ad spend, and returns — this guide walks through every dropshipping cost and shows you the formula for real profit per order.",
    date: "2026-07-20",
    readTime: "6 min",
    tags: ["Dropshipping", "Calculator"],
  },
  {
    slug: "freelance-pricing-guide",
    title: "How to Set Your Freelance Rate to Hit Your Income Goal",
    excerpt:
      "Your hourly rate is not your income. After taxes, non-billable hours, and expenses, most freelancers earn far less than they think. Here's how to reverse-engineer the right rate.",
    date: "2026-07-12",
    readTime: "5 min",
    tags: ["Freelance", "Pricing"],
  },
  {
    slug: "google-ads-roi-vs-roas",
    title: "Google Ads ROI vs ROAS: What's the Difference and Why It Matters",
    excerpt:
      "ROAS tells you revenue per ad dollar. ROI tells you profit per dollar invested. They sound similar but lead to completely different optimization decisions.",
    date: "2026-07-05",
    readTime: "5 min",
    tags: ["Google Ads", "ROI"],
  },
  {
    slug: "ecommerce-break-even-analysis",
    title: "Break-Even Analysis for Ecommerce: How Many Units Do You Need to Sell?",
    excerpt:
      "Before launching a product or ad campaign, every seller should know their break-even point. Here's how to calculate it for Shopify, Amazon, and dropshipping businesses.",
    date: "2026-06-28",
    readTime: "6 min",
    tags: ["Break-Even", "Ecommerce"],
  },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogPage() {
  const featured = posts.filter((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] mb-4">
          Ecommerce & Profit Blog
        </h1>
        <p className="text-lg text-[var(--color-muted-foreground)] max-w-2xl mx-auto">
          Actionable guides on pricing, margins, advertising ROI, and running a profitable online business.
        </p>
      </div>

      {/* Featured posts */}
      {featured.length > 0 && (
        <section className="mb-12" aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="text-xl font-bold text-[var(--color-foreground)] mb-5">
            Featured Articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featured.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 hover:border-[var(--color-primary)] hover:shadow-md transition-all"
              >
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="success" className="text-xs">{tag}</Badge>
                  ))}
                </div>
                <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2 group-hover:text-[var(--color-primary)] transition-colors leading-snug">
                  {post.title}
                </h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed mb-4">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
                  <div className="flex items-center gap-3">
                    <span>{formatDate(post.date)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {post.readTime} read
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                    Read <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Ad slot */}
      <div className="flex justify-center my-8">
        <AdSlot position="leaderboard" />
      </div>

      {/* All posts */}
      <section aria-labelledby="all-posts-heading">
        <h2 id="all-posts-heading" className="text-xl font-bold text-[var(--color-foreground)] mb-5">
          All Articles
        </h2>
        <div className="space-y-4">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 hover:border-[var(--color-primary)] hover:shadow-sm transition-all"
            >
              <div className="flex-1">
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {post.tags.map((tag) => (
                    <span key={tag} className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-0.5">
                      <Tag className="h-3 w-3" />{tag}
                    </span>
                  ))}
                </div>
                <h3 className="font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-primary)] transition-colors mb-1">
                  {post.title}
                </h3>
                <p className="text-sm text-[var(--color-muted-foreground)] line-clamp-2">{post.excerpt}</p>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1 text-xs text-[var(--color-muted-foreground)] shrink-0">
                <span>{formatDate(post.date)}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
