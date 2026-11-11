import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { HELP_FAQS, GLOSSARY_TERMS } from "@/lib/help-content";
import { SUPPORT_EMAIL, SUPPORT_RESPONSE_TIME } from "@/lib/support";
import { BookOpen, Store, Megaphone, TrendingUp, MessageCircleQuestion, Mail, ArrowRight } from "lucide-react";

export const metadata = buildMetadata({
  title: "Help Center",
  description:
    "GetProfitCalc Help Center — getting-started guides for connecting Shopify and ad accounts, reading your profit, an expanded FAQ, a profit glossary, and support contact.",
  path: "/help",
});

const GUIDES = [
  {
    icon: Store,
    href: "/help/getting-started#connect-shopify",
    title: "Connect Shopify",
    desc: "Link your store with OAuth in a few minutes, or import historical orders with CSV.",
  },
  {
    icon: Megaphone,
    href: "/help/getting-started#connect-ads",
    title: "Connect ad accounts",
    desc: "Meta, Google, TikTok, Pinterest, and Snapchat — so ad spend is matched to your orders.",
  },
  {
    icon: TrendingUp,
    href: "/help/getting-started#reading-profit",
    title: "Reading your profit",
    desc: "What net revenue, net profit, margin, and ROAS actually mean on your dashboard.",
  },
];

export default function HelpPage() {
  const previewFaqs = HELP_FAQS.slice(0, 4);
  const previewTerms = GLOSSARY_TERMS.slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center mb-12">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white mb-5">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Help Center</h1>
        <p className="text-[var(--color-muted-foreground)] text-lg max-w-xl mx-auto">
          Guides, answers, and definitions for tracking your real Shopify profit — no jargon, no guesswork.
        </p>
      </div>

      {/* Getting-started guides */}
      <section aria-labelledby="guides-heading" className="mb-14">
        <h2 id="guides-heading" className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
          Getting started
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {GUIDES.map(({ icon: Icon, href, title, desc }) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 hover:border-[var(--color-primary)] transition-colors group"
            >
              <Icon className="h-6 w-6 text-[var(--color-primary)] mb-3" />
              <p className="font-semibold text-[var(--color-foreground)] mb-1 group-hover:text-[var(--color-primary)]">
                {title}
              </p>
              <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{desc}</p>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-sm">
          <Link href="/help/getting-started" className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">
            Read all three guides <ArrowRight className="h-4 w-4" />
          </Link>
        </p>
      </section>

      {/* FAQ preview */}
      <section aria-labelledby="faq-heading" className="mb-14">
        <h2 id="faq-heading" className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
          Frequently asked questions
        </h2>
        <div className="space-y-4">
          {previewFaqs.map(({ id, question, answer }) => (
            <div key={id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
              <h3 className="font-semibold text-[var(--color-foreground)] mb-2 text-sm sm:text-base">{question}</h3>
              <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{answer}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm">
          <Link href="/help/faq" className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">
            See all {HELP_FAQS.length} questions <ArrowRight className="h-4 w-4" />
          </Link>
        </p>
      </section>

      {/* Glossary preview */}
      <section aria-labelledby="glossary-heading" className="mb-14">
        <h2 id="glossary-heading" className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
          Profit glossary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {previewTerms.map(({ id, term, definition }) => (
            <div key={id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <h3 className="font-semibold text-[var(--color-foreground)] mb-1 text-sm">{term}</h3>
              <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{definition}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm">
          <Link href="/help/glossary" className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">
            Browse all {GLOSSARY_TERMS.length} terms <ArrowRight className="h-4 w-4" />
          </Link>
        </p>
      </section>

      {/* Support */}
      <section aria-labelledby="support-heading" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <MessageCircleQuestion className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 id="support-heading" className="text-xl font-bold text-[var(--color-foreground)] mb-1">
              Still stuck?
            </h2>
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Send us a message and we aim to reply within {SUPPORT_RESPONSE_TIME}. You can also email us
              directly at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--color-primary)] hover:underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
          <Link
            href="/help/contact"
            className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-5 text-sm font-medium text-white hover:bg-green-600 transition-colors"
          >
            <Mail className="h-4 w-4" /> Contact support
          </Link>
        </div>
      </section>
    </div>
  );
}
