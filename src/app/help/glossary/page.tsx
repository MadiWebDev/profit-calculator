import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { GlossaryExplorer } from "./GlossaryExplorer";

export const metadata = buildMetadata({
  title: "Profit Glossary",
  description:
    "Plain-language definitions of net revenue, net profit, COGS, ROAS, AOV, attribution, RTO rate, and every other term on your GetProfitCalc dashboard.",
  path: "/help/glossary",
});

export default function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Profit glossary</h1>
      <p className="text-[var(--color-muted-foreground)] text-lg mb-10 leading-relaxed">
        Every term on your dashboard, defined once, plainly. Formulas match the{" "}
        <Link href="/dashboard/report-guide" className="text-[var(--color-primary)] hover:underline">
          Report Guide
        </Link>{" "}
        in your dashboard.
      </p>
      <GlossaryExplorer />
    </div>
  );
}
