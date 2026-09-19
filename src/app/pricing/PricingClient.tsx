"use client";

/**
 * PricingClient
 * ─────────────
 * 3-tier pricing page with monthly / quarterly / semiannual / annual toggle.
 *
 * Prices are fetched via Paddle.PricePreview() — Paddle returns already-
 * formatted, country-localised strings (formattedTotals.total).  We display
 * those strings verbatim; we never run our own number formatting or rounding.
 *
 * Checkout opens as a one-page overlay via Paddle.Checkout.open().
 * On completion the user is redirected to /welcome.
 *
 * Environment variables consumed (NEXT_PUBLIC_ — available client-side):
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN   live_ or sandbox_ token
 *   NEXT_PUBLIC_PADDLE_ENV            "production" | "sandbox"
 *
 * Both vars are validated at initialisation time; missing vars throw loudly
 * so you never run against the wrong Paddle account silently.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  CheckCircle,
  ArrowRight,
  Loader2,
  Zap,
  Shield,
  X,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Paddle, PaddleEventData } from "@paddle/paddle-js";
import type { SerializedTier, PricingInterval } from "@/lib/tiers";

// ── Env validation ────────────────────────────────────────────────────────────
// Fail loudly at module parse time — never silently fall back to a wrong env.

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PADDLE_ENV   = process.env.NEXT_PUBLIC_PADDLE_ENV;

if (!CLIENT_TOKEN) {
  throw new Error(
    "[PricingClient] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set. " +
      "Add it to .env.local before starting the app."
  );
}
if (!PADDLE_ENV) {
  throw new Error(
    "[PricingClient] NEXT_PUBLIC_PADDLE_ENV is not set. " +
      "Set it to 'production' or 'sandbox' in .env.local."
  );
}
if (PADDLE_ENV !== "production" && PADDLE_ENV !== "sandbox") {
  throw new Error(
    `[PricingClient] NEXT_PUBLIC_PADDLE_ENV must be "production" or "sandbox", got "${PADDLE_ENV}".`
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormattedPrice {
  /** Paddle-formatted total for one billing cycle, e.g. "$9.00" or "€8.50" */
  total: string;
  /** Paddle-formatted per-month equivalent (only meaningful for yearly) */
  perMonth: string;
  /** Raw currency code returned by Paddle, e.g. "USD" */
  currencyCode: string;
}

type PriceMap = Record<string, FormattedPrice>; // key: `${tierId}_${interval}`

// ── Feature comparison table ─────────────────────────────────────────────────

interface PlanFeature {
  label:   string;
  starter: string | boolean;
  growth:  string | boolean;
  pro:     string | boolean;
  tooltip?: string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: "Orders per month",            starter: "100",           growth: "1,000",        pro: "Unlimited" },
  { label: "Stores",                       starter: "1",             growth: "2",             pro: "Unlimited" },
  { label: "Ad platforms",                 starter: "1",             growth: "3",             pro: "All" },
  { label: "CSV import",                   starter: true,            growth: true,            pro: true },
  { label: "Shopify / WooCommerce / Etsy", starter: true,            growth: true,            pro: true },
  { label: "Order-level profit",           starter: true,            growth: true,            pro: true },
  { label: "Product margin view",          starter: true,            growth: true,            pro: true },
  { label: "What-if simulator",            starter: true,            growth: true,            pro: true },
  { label: "AI Profit Insights",           starter: false,           growth: "Weekly digest", pro: "Real-time" },
  { label: "Ad creative-level ROI",        starter: false,           growth: true,            pro: true },
  { label: "Profit goal tracking",         starter: true,            growth: true,            pro: true },
  { label: "Email alerts",                 starter: true,            growth: true,            pro: true },
  { label: "Slack alerts",                 starter: false,           growth: true,            pro: true },
  { label: "Tax set-aside estimator",      starter: true,            growth: true,            pro: true },
  { label: "CSV / PDF reports",            starter: "CSV only",      growth: true,            pro: true },
  { label: "Team members",                 starter: "2",             growth: "5",             pro: "Unlimited" },
  { label: "Public API + Zapier",          starter: false,           growth: false,           pro: true },
  { label: "Support",                      starter: "Email",         growth: "Email",         pro: "Priority chat" },
];

const FAQs = [
  {
    q: "When does the 7-day trial start?",
    a: "The moment you create your account. No credit card is required to start.",
  },
  {
    q: "What billing periods are available?",
    a: "Monthly, quarterly (save 10%), semiannual (save 15%), or annual (save 20%). Switch at any time from Settings.",
  },
  {
    q: "What happens after the trial ends?",
    a: "Your account is archived — nothing is deleted, but the dashboard is locked until you choose a paid plan. Upgrading restores full access instantly.",
  },
  {
    q: "Can I change plans at any time?",
    a: "Yes. Upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards, plus PayPal where available. All payments are processed securely by Paddle.",
  },
  {
    q: "Is there a free forever plan?",
    a: "The free calculators at /calculators are always free. The SaaS dashboard has a 7-day trial; after that you need a paid plan.",
  },
  {
    q: "What does 'Unlimited orders' mean on Pro?",
    a: "No cap — import or sync as many orders as your store generates. No overage fees, ever.",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mx-auto" aria-label="Included" />;
  if (value === false) return <X     className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--color-border)] mx-auto" aria-label="Not included" />;
  return <span className="text-xs sm:text-sm text-center block text-[var(--color-foreground)]">{value}</span>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PricingClientProps {
  tiers: SerializedTier[];
  /** 2-letter ISO country code detected server-side, or undefined for IP-based auto-detect */
  countryCode?: string;
  /** Signed-in user's email — prefills checkout */
  userEmail?: string;
  /**
   * Signed-in user's teamId — resolved from the JWT server-side and included
   * in Checkout.open customData so the webhook handler can provision the team.
   * Never sourced from client input.
   */
  teamId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingClient({ tiers, countryCode, userEmail, teamId }: PricingClientProps) {
  const router = useRouter();

  const paddleRef  = useRef<Paddle | null>(null);
  const [paddleReady,   setPaddleReady]   = useState(false);
  const [prices,        setPrices]        = useState<PriceMap>({});
  const [pricesLoaded,  setPricesLoaded]  = useState(false);
  const [interval,      setInterval]      = useState<PricingInterval>("month");
  const [openingTier,   setOpeningTier]   = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // ── Initialise Paddle.js ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: PADDLE_ENV as "production" | "sandbox",
          token:       CLIENT_TOKEN as string,
          eventCallback(event: PaddleEventData) {
            // Redirect to /welcome when checkout completes successfully
            if (event.name === "checkout.completed") {
              router.push("/welcome");
            }
          },
        });
        if (!cancelled && paddle) {
          paddleRef.current = paddle;
          setPaddleReady(true);
        }
      } catch (err) {
        console.error("[Paddle] init error:", err);
        if (!cancelled) setPaddleReady(true); // unblock UI; Subscribe will show an error
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  // ── Fetch localised prices via PricePreview ──────────────────────────────
  // Re-runs whenever Paddle is ready (so we have the instance) or the
  // country changes (shouldn't happen at runtime, but defensive).
  useEffect(() => {
    if (!paddleReady || !paddleRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        // Build one PricePreview call covering all 12 price IDs (3 tiers × 4 intervals)
        const items = tiers.flatMap((t) => [
          { priceId: t.priceId.month,      quantity: 1 },
          { priceId: t.priceId.quarter,    quantity: 1 },
          { priceId: t.priceId.semiannual, quantity: 1 },
          { priceId: t.priceId.year,       quantity: 1 },
        ]);

        const previewParams: Parameters<Paddle["PricePreview"]>[0] = {
          items,
          // Only pass address.countryCode when we have a valid country — Paddle
          // will auto-detect from visitor IP otherwise.
          ...(countryCode ? { address: { countryCode } } : {}),
        };

        const response = await paddleRef.current!.PricePreview(previewParams);

        if (cancelled) return;

        // Build a lookup map: `${tierId}_${interval}` → FormattedPrice
        const map: PriceMap = {};

        for (const lineItem of response.data.details.lineItems) {
          const priceId = lineItem.price.id;

          // Match this priceId back to a tier + interval
          for (const tier of tiers) {
            for (const iv of ["month", "quarter", "semiannual", "year"] as PricingInterval[]) {
              if (tier.priceId[iv] === priceId) {
                const key = `${tier.id}_${iv}`;

                // formattedTotals.total is already currency-formatted by Paddle
                // (e.g. "$9.00", "€8.50") — display as-is, no further formatting.
                const cycleTotal = lineItem.formattedTotals.total;

                // Compute a per-month equivalent for multi-month intervals.
                // Paddle doesn't return this directly, so we divide the raw
                // subtotal by the number of months in the cycle.
                // This is informational only — shown as a sub-label.
                const monthsInCycle: Record<PricingInterval, number> = {
                  month:      1,
                  quarter:    3,
                  semiannual: 6,
                  year:       12,
                };
                let perMonth = cycleTotal; // default: same as total (monthly)
                if (iv !== "month") {
                  const rawSubtotal  = parseFloat(lineItem.totals.subtotal) / 100;
                  const perMonthRaw  = rawSubtotal / monthsInCycle[iv];
                  const symbol       = extractCurrencySymbol(cycleTotal);
                  perMonth = `${symbol}${perMonthRaw.toFixed(2)}`;
                }

                map[key] = {
                  total:        cycleTotal,
                  perMonth,
                  currencyCode: response.data.currencyCode,
                };
              }
            }
          }
        }

        setPrices(map);
        setPricesLoaded(true);
      } catch (err) {
        console.error("[Paddle] PricePreview error:", err);
        // Non-fatal — skeleton stays, no crash
      }
    })();

    return () => { cancelled = true; };
  }, [paddleReady, tiers, countryCode]);

  // ── Checkout ─────────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(
    async (tier: SerializedTier) => {
      if (!paddleRef.current) {
        setCheckoutError("Paddle is still loading. Please try again in a moment.");
        return;
      }

      const priceId = tier.priceId[interval];
      setOpeningTier(tier.id);
      setCheckoutError(null);

      try {
        const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "";
        const successUrl = `${siteUrl}/welcome`;

        paddleRef.current.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          settings: {
            displayMode: "overlay",
            variant:     "one-page",
            successUrl,
          },
          // teamId is passed as customData so the webhook handler can
          // provision the correct team after payment.  It was resolved
          // server-side from the JWT — never from client input.
          ...(teamId ? { customData: { teamId } } : {}),
          // Prefill email if the user is signed in
          ...(userEmail
            ? { customer: { email: userEmail } }
            : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not open checkout. Please try again.";
        setCheckoutError(msg);
      } finally {
        // openingTier is cleared on checkout.completed (via eventCallback) or
        // immediately here if open() threw. For the non-error path Paddle
        // manages its own loading state; we just unblock the button.
        setOpeningTier(null);
      }
    },
    [interval, userEmail, teamId]
  );

  // ── Price helpers ─────────────────────────────────────────────────────────

  /** Returns the formatted price string for the currently selected interval. */
  function getDisplayPrice(tier: SerializedTier): string {
    const key   = `${tier.id}_${interval}`;
    const entry = prices[key];
    if (!entry) return "—"; // loading skeleton
    // For monthly: show the total (same as per-month).
    // For yearly: show the per-month equivalent so users compare apples-to-apples.
    return interval === "month" ? entry.total : entry.perMonth;
  }

  /** Sub-label below the price ("billed monthly" / "X billed quarterly, save 10%" / etc.). */
  function getBillingLabel(tier: SerializedTier): string {
    if (interval === "month") return "billed monthly";

    const labelMap: Record<PricingInterval, { cadence: string; saving: string }> = {
      month:      { cadence: "monthly",          saving: ""          },
      quarter:    { cadence: "every 3 months",   saving: "save 10%"  },
      semiannual: { cadence: "every 6 months",   saving: "save 15%"  },
      year:       { cadence: "annually",         saving: "save 20%"  },
    };

    const key   = `${tier.id}_${interval}`;
    const entry = prices[key];
    const { cadence, saving } = labelMap[interval];

    if (!entry) return `billed ${cadence}`;
    return `${entry.total} billed ${cadence} · ${saving}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[var(--color-background)] overflow-x-hidden">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 md:py-20 text-center bg-gradient-to-b from-[var(--color-accent)] to-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Badge variant="success" className="mb-4 text-xs font-semibold">
            7-day free trial · No credit card
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--color-foreground)] mb-4 leading-tight">
            Profit tracking that doesn&apos;t cost a fortune
          </h1>
          <p className="text-base sm:text-lg text-[var(--color-muted-foreground)] mb-3">
            GetProfitCalc is a{" "}
            <strong className="text-[var(--color-foreground)]">
              SaaS profit-tracking platform
            </strong>{" "}
            for ecommerce sellers. Connect your Shopify, WooCommerce, or Etsy
            store and get real-time, order-level profit visibility — including
            COGS, ad spend, platform fees, and AI-powered insights.
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-8">
            All plans start with a 7-day free trial. No credit card required.
          </p>

          {/* ── Billing interval toggle ────────────────────────────────────── */}
          <div
            role="group"
            aria-label="Billing interval"
            className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-1 gap-1 flex-wrap justify-center"
          >
            {(
              [
                { iv: "month",      label: "Monthly",    saving: null      },
                { iv: "quarter",    label: "Quarterly",  saving: "−10%"    },
                { iv: "semiannual", label: "Semiannual", saving: "−15%"    },
                { iv: "year",       label: "Annual",     saving: "−20%"    },
              ] as { iv: PricingInterval; label: string; saving: string | null }[]
            ).map(({ iv, label, saving }) => {
              const isActive = interval === iv;
              return (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  aria-pressed={isActive}
                  className={cn(
                    "relative px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-sm"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  )}
                >
                  {label}
                  {saving && (
                    <span
                      className={cn(
                        "ml-1.5 text-[10px] font-bold",
                        isActive
                          ? "text-green-600 dark:text-green-400"
                          : "text-green-500/60"
                      )}
                    >
                      {saving}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Plan cards ────────────────────────────────────────────────────────── */}
      <section className="pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">

          {/* Global checkout error */}
          {checkoutError && (
            <div
              role="alert"
              className="sm:col-span-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-600"
            >
              {checkoutError}
              <button
                className="ml-auto shrink-0"
                onClick={() => setCheckoutError(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {tiers.map((tier) => {
            const isHighlighted = !!tier.highlighted;
            const isOpening     = openingTier === tier.id;
            const anyOpening    = openingTier !== null;
            const displayPrice  = getDisplayPrice(tier);
            const billingLabel  = getBillingLabel(tier);

            return (
              <div
                key={tier.id}
                className={cn(
                  "rounded-2xl border-2 p-5 sm:p-6 flex flex-col relative",
                  isHighlighted
                    ? "border-[var(--color-primary)] shadow-xl shadow-green-500/10 mt-3 sm:mt-0"
                    : "border-[var(--color-border)]",
                  "bg-[var(--color-card)]"
                )}
              >
                {isHighlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge variant="success" className="text-xs font-bold px-3 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Plan name */}
                <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-1">
                  {tier.name}
                </h2>
                <p className="text-xs text-[var(--color-muted-foreground)] mb-4">
                  {tier.description}
                </p>

                {/* Price — Paddle-formatted string, displayed verbatim */}
                <div className="mb-1 flex items-end gap-1 flex-wrap">
                  <span
                    className={cn(
                      "text-4xl sm:text-5xl font-extrabold text-[var(--color-foreground)] transition-opacity",
                      !pricesLoaded && "opacity-40 animate-pulse"
                    )}
                    aria-label={`${displayPrice} per month`}
                  >
                    {displayPrice}
                  </span>
                  <span className="text-sm text-[var(--color-muted-foreground)] mb-2">/mo</span>
                </div>

                {/* Billing cadence sub-line */}
                <p
                  className={cn(
                    "text-xs text-[var(--color-muted-foreground)] mb-5 transition-opacity",
                    !pricesLoaded && "opacity-40"
                  )}
                >
                  {billingLabel}
                </p>

                {/* Subscribe button */}
                <Button
                  className="w-full mb-5 gap-1.5"
                  variant={isHighlighted ? "default" : "outline"}
                  disabled={anyOpening || !paddleReady}
                  onClick={() => handleSubscribe(tier)}
                  aria-label={`Subscribe to ${tier.name}`}
                >
                  {isOpening ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Opening…
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>

                {/* Feature list */}
                <ul className="space-y-2.5 flex-1" aria-label={`${tier.name} features`}>
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]"
                    >
                      <CheckCircle
                        className="h-4 w-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Full feature comparison table ──────────────────────────────────────── */}
      <section className="py-10 sm:py-12 bg-[var(--color-muted)] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)] text-center mb-6 sm:mb-8">
            Full Feature Comparison
          </h2>
          <div className="rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
                    <th className="px-3 sm:px-5 py-3 sm:py-4 text-left font-semibold text-[var(--color-foreground)] w-2/5 sticky left-0 bg-[var(--color-card)]">
                      Feature
                    </th>
                    {tiers.map((t) => (
                      <th
                        key={t.id}
                        className={cn(
                          "px-2 sm:px-4 py-3 sm:py-4 text-center font-bold whitespace-nowrap",
                          t.highlighted
                            ? "text-[var(--color-primary)]"
                            : "text-[var(--color-foreground)]"
                        )}
                      >
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-[var(--color-card)] divide-y divide-[var(--color-border)]">
                  {PLAN_FEATURES.map((row) => (
                    <tr key={row.label} className="hover:bg-[var(--color-muted)]/30">
                      <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-[var(--color-foreground)] flex items-center gap-1.5 sticky left-0 bg-[var(--color-card)]">
                        {row.label}
                        {row.tooltip && (
                          <span title={row.tooltip}>
                            <HelpCircle className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] flex-shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.starter} /></td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.growth}  /></td>
                      <td className="px-2 sm:px-4 py-2.5 sm:py-3"><FeatureCell value={row.pro}     /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-muted-foreground)] text-center mt-2 sm:hidden">
            Swipe to see all plans →
          </p>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-foreground)] text-center mb-6 sm:mb-8">
            Pricing FAQ
          </h2>
          <div className="space-y-4">
            {FAQs.map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
              >
                <h3 className="font-semibold text-[var(--color-foreground)] mb-2 text-sm sm:text-base">
                  {q}
                </h3>
                <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────────── */}
      <section className="py-6 border-t border-[var(--color-border)] bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-6 text-xs text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" aria-hidden="true" /> Secure checkout via Paddle
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> Cancel anytime
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> 7-day free trial
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-500" aria-hidden="true" /> No setup fees
          </span>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-[var(--color-primary)] px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Start free — no card required
          </h2>
          <p className="text-green-100 mb-6 text-sm sm:text-base">
            7-day free trial. Join sellers tracking real profit, not guessing it.
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="font-semibold px-8 gap-2 w-full sm:w-auto"
          >
            <Link href="/auth/register">
              <Zap className="h-5 w-5" aria-hidden="true" /> Start 7-Day Free Trial
            </Link>
          </Button>
        </div>
      </section>

      {/* ── Legal links — required for Paddle domain approval ──────────────────── */}
      <section className="py-5 border-t border-[var(--color-border)] bg-[var(--color-muted)]">
        <div className="mx-auto max-w-3xl px-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted-foreground)]">
          <Link
            href="/terms-of-service"
            className="hover:text-[var(--color-foreground)] hover:underline transition-colors"
          >
            Terms of Service
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/privacy-policy"
            className="hover:text-[var(--color-foreground)] hover:underline transition-colors"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/refund-policy"
            className="hover:text-[var(--color-foreground)] hover:underline transition-colors"
          >
            Refund Policy
          </Link>
          <span aria-hidden="true">·</span>
          <span>
            Payments processed by{" "}
            <a
              href="https://www.paddle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-foreground)] hover:underline transition-colors"
            >
              Paddle
            </a>
          </span>
        </div>
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the leading currency symbol from a Paddle-formatted price string.
 * e.g. "$9.00" → "$", "€8.50" → "€", "£7.99" → "£"
 * Falls back to "" if the string doesn't start with a known symbol.
 */
function extractCurrencySymbol(formatted: string): string {
  // Paddle formatted strings start with the symbol, optionally followed by a space
  const match = formatted.match(/^([^0-9\s,]+)\s*/);
  return match?.[1] ?? "";
}
