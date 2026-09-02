import Link from "next/link";
import { Calculator } from "lucide-react";

const footerLinks = {
  Product: [
    { href: "/features",                  label: "Features" },
    { href: "/pricing",                   label: "Pricing" },
    { href: "/compare/profitcalc-io",     label: "Compare" },
    { href: "/dashboard",                 label: "Dashboard" },
    { href: "/onboarding",                label: "Connect Store" },
  ],
  Calculators: [
    { href: "/calculators/shopify-profit",    label: "Shopify Profit" },
    { href: "/calculators/meta-ads-roas",     label: "Meta Ads ROAS" },
    { href: "/calculators/google-ads-roi",    label: "Google Ads ROI" },
    { href: "/calculators/dropshipping-profit",label: "Dropshipping" },
    { href: "/calculators/amazon-fba-profit", label: "Amazon FBA" },
    { href: "/calculators/profit-margin",     label: "Profit Margin" },
  ],
  Company: [
    { href: "/blog",           label: "Blog" },
    { href: "/about",          label: "About" },
    { href: "/contact",        label: "Contact" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/terms-of-service",label: "Terms of Service" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-muted)] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
                <Calculator className="h-4 w-4" />
              </span>
              <span>Profit<span className="text-[var(--color-primary)]">Calc</span></span>
            </Link>
            <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
              Free profit calculators and real-time profit tracking for ecommerce sellers. Starts at $2/month.
            </p>
          </div>

          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">{section}</h3>
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
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--color-muted-foreground)]">
          <p>© {new Date().getFullYear()} CalcProfit. All rights reserved.</p>
          <p>For informational purposes only. Not financial or tax advice.</p>
        </div>
      </div>
    </footer>
  );
}
