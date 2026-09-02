import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Terms of Service",
  description: "CalcProfit terms of service — rules for using our free profit and ROI calculators.",
  path: "/terms-of-service",
});

const LAST_UPDATED = "August 1, 2026";
const CONTACT_EMAIL = "hello@profitcalc.io";
const SITE_URL = "https://profitcalc.io";

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">Terms of Service</h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing and using CalcProfit at{" "}
            <a href={SITE_URL} className="text-[var(--color-primary)] hover:underline">{SITE_URL}</a>
            {" "}("the Site"), you accept and agree to be bound by these Terms of Service and our
            Privacy Policy. If you do not agree, please do not use the Site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">2. Description of Service</h2>
          <p>
            CalcProfit provides free, browser-based profit and ROI calculators for informational and educational
            purposes. The calculators process data entered by users entirely within the browser and produce
            estimated outputs based on provided formulas.
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
            Nothing on CalcProfit constitutes financial, tax, legal, investment, or business advice. The
            calculators are tools to assist with your own analysis. For decisions involving significant financial
            risk, consult a qualified accountant, financial advisor, or legal professional.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">5. Limitation of Liability</h2>
          <p>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, PROFITCALC SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
            DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SITE OR RELIANCE ON ITS CALCULATORS, EVEN IF
            ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">6. Acceptable Use</h2>
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
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">7. Intellectual Property</h2>
          <p>
            All content on CalcProfit — including text, formulas, design, code, and branding — is the
            intellectual property of CalcProfit or its content providers and is protected by copyright law.
            You may not reproduce, distribute, or create derivative works without explicit written permission.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">8. Third-Party Links and Advertising</h2>
          <p>
            The Site may display third-party advertisements (Google AdSense) and contain links to external
            websites. We are not responsible for the content, privacy practices, or accuracy of third-party
            sites. Clicking ads or links is at your own discretion and risk.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">9. Modifications to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Changes take effect immediately upon
            posting to the Site. Continued use after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">10. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with applicable law. Any disputes
            shall be resolved through good-faith negotiation, and failing that, through binding arbitration.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">11. Contact</h2>
          <p>
            Questions about these Terms? Contact us at:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--color-primary)] hover:underline">{CONTACT_EMAIL}</a>
          </p>
        </section>

      </div>
    </div>
  );
}
