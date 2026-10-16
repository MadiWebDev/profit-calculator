import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Terms of Service",
  description: "GetProfitCalc terms of service — rules for using our free profit calculators and paid SaaS profit-tracking platform.",
  path: "/terms-of-service",
});

const LAST_UPDATED = "September 19, 2026";
const CONTACT_EMAIL = "hello@getprofitcalc.com";
const SITE_URL = "https://getprofitcalc.com";
const LEGAL_NAME = "Muhammad Hammad - codexengr";

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">Terms of Service</h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">1. Acceptance of Terms</h2>
          <p className="mb-3">
            GetProfitCalc is operated by{" "}
            <strong className="text-[var(--color-foreground)]">{LEGAL_NAME}</strong>, a sole proprietor
            based in Pakistan (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
          </p>
          <p>
            By accessing and using GetProfitCalc at{" "}
            <a href={SITE_URL} className="text-[var(--color-primary)] hover:underline">{SITE_URL}</a>
            {" "}(&ldquo;the Site&rdquo;), you accept and agree to be bound by these Terms of Service and our
            Privacy Policy. If you do not agree, please do not use the Site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">2. Description of Service</h2>
          <p className="mb-3">
            GetProfitCalc offers two distinct services:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2 mb-3">
            <li>
              <strong className="text-[var(--color-foreground)]">Free Calculators:</strong>{" "}
              Browser-based profit and ROI calculators for informational and educational purposes. These
              are available to all visitors at no cost and require no account.
            </li>
            <li>
              <strong className="text-[var(--color-foreground)]">SaaS Profit-Tracking Platform (paid):</strong>{" "}
              A subscription-based software-as-a-service (SaaS) dashboard that connects to your ecommerce
              store (Shopify, WooCommerce, Etsy, or via CSV import) and automatically tracks real-time
              order-level profit, COGS, ad spend, and provides AI-powered insights. Paid plans are
              available at Starter ($3/mo), Growth ($9/mo), and Pro ($25/mo), billed through our
              Merchant of Record, <a href="https://www.paddle.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">Paddle.com</a>.
              All paid plans begin with a 7-day free trial requiring no credit card.
            </li>
          </ul>
          <p>
            The calculator outputs are estimates based on user-provided inputs. Platform fees, tax
            rates, and other variables change frequently — always verify critical financial figures
            with official sources or a qualified professional.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">3. Disclaimer of Warranties</h2>
          <p className="mb-3">
            THE SITE AND ITS CALCULATORS ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
            WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          </p>
          <p>
            We do not warrant that the calculations are accurate, complete, error-free, or suitable for any
            specific purpose. Platform fees, tax rates, and other variables change frequently. Always verify
            critical financial figures with official sources or a qualified professional.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">4. No Financial or Professional Advice</h2>
          <p>
            Nothing on GetProfitCalc constitutes financial, tax, legal, investment, or business advice. The
            calculators are tools to assist with your own analysis. For decisions involving significant financial
            risk, consult a qualified accountant, financial advisor, or legal professional.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">5. Limitation of Liability</h2>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, GETPROFITCALC SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
            DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SITE OR RELIANCE ON ITS CALCULATORS, EVEN IF
            ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">6. Accounts</h2>
          <p className="mb-3">
            To access the SaaS platform you must create an account. You are responsible for maintaining
            the confidentiality of your credentials and for all activity under your account. You must
            provide accurate and complete registration information and keep it up to date.
          </p>
          <p>
            You must be at least 18 years old to create an account and subscribe to a paid plan.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">7. Subscriptions &amp; Billing</h2>
          <p className="mb-3">
            Paid subscriptions are billed in advance on a recurring basis (monthly, quarterly,
            semi-annually, or annually depending on your chosen plan). All payments are processed by{" "}
            <a
              href="https://www.paddle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Paddle.com
            </a>
            , our Merchant of Record, who is responsible for payment processing, invoicing, VAT/sales
            tax collection, and issuing receipts.
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2 mb-3">
            <li>
              <strong className="text-[var(--color-foreground)]">Free trial:</strong> All paid plans
              include a 7-day free trial. No credit card is required during the trial. You will only
              be charged if you explicitly choose to subscribe after the trial ends.
            </li>
            <li>
              <strong className="text-[var(--color-foreground)]">Renewal:</strong> Subscriptions
              renew automatically at the end of each billing period unless cancelled beforehand via
              Dashboard → Settings → Billing &amp; Plan.
            </li>
            <li>
              <strong className="text-[var(--color-foreground)]">Price changes:</strong> We will
              notify you at least 14 days before any price increase takes effect on your existing
              subscription.
            </li>
          </ul>
          <p>
            For refunds, see our{" "}
            <a href={`${SITE_URL}/refund-policy`} className="text-[var(--color-primary)] hover:underline">
              Refund Policy
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">8. Termination</h2>
          <p className="mb-3">
            You may cancel your subscription and close your account at any time. We reserve the right
            to suspend or terminate accounts that violate these Terms, engage in fraudulent activity,
            or abuse the platform. Upon termination, your access to the SaaS platform ceases at the
            end of your current billing period.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">9. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Use the site for any unlawful purpose</li>
            <li>Attempt to reverse-engineer, scrape, or systematically copy content</li>
            <li>Introduce malware, viruses, or other malicious code</li>
            <li>Misrepresent the outputs of our calculators</li>
            <li>Use automated tools to access the site at a rate that impairs service for others</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">10. Intellectual Property</h2>
          <p>
            All content on GetProfitCalc — including text, formulas, design, code, and branding — is the
            intellectual property of GetProfitCalc or its content providers and is protected by copyright law.
            You may not reproduce, distribute, or create derivative works without explicit written permission.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">11. Third-Party Links and Advertising</h2>
          <p>
            The Site may display third-party advertisements (Google AdSense) and contain links to external
            websites. We are not responsible for the content, privacy practices, or accuracy of third-party
            sites. Clicking ads or links is at your own discretion and risk.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">12. Modifications to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Changes take effect immediately upon
            posting to the Site. Continued use after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">13. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the
            Islamic Republic of Pakistan. Any disputes arising from or relating to these Terms or
            your use of the Site shall first be resolved through good-faith negotiation between
            the parties, and failing that, through binding arbitration conducted under Pakistani
            law. By using the Site, you consent to the personal jurisdiction of Pakistan for any
            such proceedings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">14. Contact</h2>
          <p>
            Questions about these Terms? Contact us at:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--color-primary)] hover:underline">{CONTACT_EMAIL}</a>
            <br />
            <span className="text-sm">{LEGAL_NAME} — GetProfitCalc, Pakistan</span>
          </p>
        </section>

      </div>
    </div>
  );
}
