import { buildMetadata } from "@/lib/seo";
import { FaqExplorer } from "./FaqExplorer";

export const metadata = buildMetadata({
  title: "Frequently Asked Questions",
  description:
    "Answers about GetProfitCalc pricing ($3/$18/$29, 7-day trial), connecting Shopify, Meta and TikTok ad accounts, how net profit is calculated, and account security.",
  path: "/help/faq",
});

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Frequently asked questions</h1>
      <p className="text-[var(--color-muted-foreground)] text-lg mb-10 leading-relaxed">
        Prices, trials, connections, and how your profit is calculated — answered with the real numbers.
      </p>
      <FaqExplorer />
    </div>
  );
}
