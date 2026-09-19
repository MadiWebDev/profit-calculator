'use client'
import Link from "next/link";
import Image from "next/image";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { FooterInstallButton } from "./pwa/footer-install-button";
import { motion } from 'framer-motion';
const productLinks = [
  { href: "/features",            label: "Features" },
  { href: "/pricing",             label: "Pricing" },
  { href: "/compare/profitcalc-io", label: "Compare" },
  { href: "/dashboard",           label: "Dashboard" },
  { href: "/onboarding",          label: "Connect Store" },
  { href: "/docs/api",            label: "API Docs" },
];

const ecommerceCalcs = [
  { href: "/calculators/shopify-profit",        label: "Shopify Profit" },
  { href: "/calculators/amazon-fba-profit",     label: "Amazon FBA" },
  { href: "/calculators/dropshipping-profit",   label: "Dropshipping" },
  { href: "/calculators/profit-margin",         label: "Profit Margin" },
  { href: "/calculators/retail-markup",         label: "Retail Markup" },
  { href: "/calculators/subscription-box-profit", label: "Subscription Box" },
  { href: "/calculators/break-even-point",      label: "Break-Even Point" },
  { href: "/calculators/tax-on-sale",           label: "Tax on Sale" },
];

const adsCalcs = [
  { href: "/calculators/meta-ads-roas",   label: "Meta Ads ROAS" },
  { href: "/calculators/google-ads-roi",  label: "Google Ads ROI" },
  { href: "/calculators/ltv-cac",         label: "LTV / CAC" },
];

const financeCalcs = [
  { href: "/calculators/compound-interest",     label: "Compound Interest" },
  { href: "/calculators/stock-profit",          label: "Stock Profit" },
  { href: "/calculators/crypto-profit",         label: "Crypto Profit" },
  { href: "/calculators/crypto-staking-roi",    label: "Crypto Staking ROI" },
  { href: "/calculators/dividend-yield",        label: "Dividend Yield" },
  { href: "/calculators/dollar-cost-averaging", label: "Dollar Cost Avg" },
  { href: "/calculators/etf-fee-impact",        label: "ETF Fee Impact" },
  { href: "/calculators/valuation-multiple",    label: "Valuation Multiple" },
];

const businessCalcs = [
  { href: "/calculators/freelancer-profit",         label: "Freelancer Profit" },
  { href: "/calculators/saas-mrr",                  label: "SaaS MRR" },
  { href: "/calculators/saas-churn-cost",           label: "SaaS Churn Cost" },
  { href: "/calculators/saas-pricing-margin",       label: "SaaS Pricing Margin" },
  { href: "/calculators/burn-rate-runway",          label: "Burn Rate & Runway" },
];

const realEstateCalcs = [
  { href: "/calculators/rental-property-roi",   label: "Rental Property ROI" },
  { href: "/calculators/house-flipping-profit", label: "House Flipping" },
  { href: "/calculators/cap-rate",              label: "Cap Rate" },
  { href: "/calculators/rent-vs-buy",           label: "Rent vs Buy" },
  { href: "/calculators/mortgage-affordability",label: "Mortgage Affordability" },
  { href: "/calculators/property-management-fee", label: "Property Mgmt Fee" },
];

const foodCalcs = [
  { href: "/calculators/restaurant-profit-margin", label: "Restaurant Margin" },
  { href: "/calculators/food-cost-percentage",     label: "Food Cost %" },
  { href: "/calculators/menu-price",               label: "Menu Price" },
];

const companyLinks = [
  { href: "/blog",              label: "Blog" },
  { href: "/about",             label: "About" },
  { href: "/contact",           label: "Contact" },
  { href: "/privacy-policy",    label: "Privacy Policy" },
  { href: "/terms-of-service",  label: "Terms of Service" },
  { href: "/refund-policy",     label: "Refund Policy" },
];

function FooterLinkList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">{title}</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
    const {
    isInstalled,
  } = usePWAInstall();
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-muted)] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">

        {/* Top row: brand + product + company */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center font-bold text-xl" aria-label="GetProfitCalc home">
              <Image
                src="/getprofitcalc.png"
                alt="GetProfitCalc logo"
                width={100}
                height={100}
                className="h-12 w-12 rounded-lg object-contain"
                priority
              />
              <span className="text-[var(--color-foreground)]">
                Get<span className="text-[var(--color-primary)]">Profit</span>Calc
              </span>
            </Link>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Free profit calculators and real-time profit tracking for ecommerce sellers. Starts at $3/month.
            </p>
          </div>

          <FooterLinkList title="Product" links={productLinks} />
          <FooterLinkList title="Ecommerce" links={ecommerceCalcs} />
          <FooterLinkList title="Company" links={companyLinks} />
        </div>

        {/* Calculator mega-row */}
        <div className="border-t border-[var(--color-border)] pt-8 mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-5">
            All Calculators
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-8">
            <FooterLinkList title="Ads & Marketing" links={adsCalcs} />
            <FooterLinkList title="Business & SaaS" links={businessCalcs} />
            {/* <FooterLinkList title="Investing" links={financeCalcs} /> */}
            <FooterLinkList title="Real Estate" links={realEstateCalcs} />
            <FooterLinkList title="Food & Restaurant" links={foodCalcs} />
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">Browse All</h3>
              <Link
                href="/calculators"
                className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
              >
                View all free calculators →
              </Link>
               {/* ── PWA Install Row ──────────────────────────────────────────────── */}
          {!isInstalled &&  <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="mt-10 pt-8 border-t border-border/50 flex grid-cols-2 items-center justify-between gap-4"
          >
           
            <FooterInstallButton />
          </motion.div> }
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--color-muted-foreground)]">
          <p>© {new Date().getFullYear()} GetProfitCalc. All rights reserved.</p>
         <p className="text-[11px] text-foreground/40">
              Operated by Muhammad Hammad - {" "}
                <a
                  href="https://www.codexengr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground/60 transition-colors"
                >
                  CodexEngr
                </a>
              </p>
          <p>For informational purposes only. Not financial or tax advice.</p>
        </div>
      </div>
    </footer>
  );
}
