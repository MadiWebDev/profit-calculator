import type { Metadata } from "next";
import Link from "next/link";

/**
 * The 404 page is noindex: unknown (non-blog) mistyped URLs still
 * return HTTP 200 in this app (streaming renders the not-found
 * boundary after the headers are sent — see the Phase 2 report), so
 * the page must at least never be indexed. Links are followed: they
 * all point at real public pages.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

/**
 * Custom 404 page. Rendered for unknown routes and for notFound()
 * calls (e.g. /blog/<bad slug>). It links to the pages most visitors
 * are looking for instead of leaving them at a dead end.
 */
export default function NotFound() {
  const links = [
    { href: "/", label: "Home", desc: "Free profit calculators and real-time tracking" },
    { href: "/calculators", label: "All calculators", desc: "Shopify, Amazon FBA, ads, SaaS and more" },
    { href: "/calculators/shopify-profit", label: "Shopify profit calculator", desc: "Your real net profit per order" },
    { href: "/blog", label: "Blog", desc: "Profit guides for ecommerce sellers" },
    { href: "/pricing", label: "Pricing", desc: "Plans from $3/month, 7-day trial" },
    { href: "/help", label: "Help Center", desc: "Guides, FAQ and support" },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-2xl w-full">
        <p className="text-7xl font-bold text-[var(--color-foreground)]">404</p>
        <h1 className="mt-4 text-2xl font-bold text-[var(--color-foreground)]">
          This page doesn&apos;t exist
        </h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          The link may be broken, or the page may have moved. Here are
          the pages most visitors are looking for:
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 text-left">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:border-[var(--color-primary)] transition-colors"
            >
              <span className="block font-semibold text-[var(--color-foreground)]">
                {link.label}
              </span>
              <span className="block text-sm text-[var(--color-muted-foreground)]">
                {link.desc}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
