import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Privacy Policy",
  description: "CalcProfit privacy policy — how we collect, use, and protect your data, including our use of Google AdSense and cookies.",
  path: "/privacy-policy",
});

const LAST_UPDATED = "August 1, 2026";
const SITE_URL = "https://profitcalc.io";
const CONTACT_EMAIL = "hello@profitcalc.io";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">Privacy Policy</h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">1. Introduction</h2>
          <p>
            Welcome to CalcProfit (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information when you visit{" "}
            <a href={SITE_URL} className="text-[var(--color-primary)] hover:underline">{SITE_URL}</a>.
            Please read this policy carefully. If you disagree with its terms, please discontinue use of our site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">2. Information We Collect</h2>
          <h3 className="font-semibold text-[var(--color-foreground)] mb-2">Information You Provide</h3>
          <p className="mb-3">
            All calculator inputs you enter (costs, prices, percentages) are processed entirely in your browser.
            We do not collect, store, or transmit your calculator data to our servers.
          </p>
          <h3 className="font-semibold text-[var(--color-foreground)] mb-2">Automatically Collected Information</h3>
          <p>
            When you visit our site, we may automatically collect certain information about your device, including
            your IP address, browser type, operating system, pages visited, time spent on pages, and referring URLs.
            This information is used for analytics purposes via Google Analytics.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">3. Cookies</h2>
          <p className="mb-3">
            We use cookies and similar tracking technologies to improve your experience on our site. Cookies are
            small data files stored on your device. You can instruct your browser to refuse cookies, but some parts
            of the site may not function properly.
          </p>
          <p className="mb-3">Types of cookies we use:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li><strong className="text-[var(--color-foreground)]">Functional cookies:</strong> Store your cookie consent preference.</li>
            <li><strong className="text-[var(--color-foreground)]">Analytics cookies:</strong> Google Analytics, to understand how visitors use the site.</li>
            <li><strong className="text-[var(--color-foreground)]">Advertising cookies:</strong> Google AdSense, to serve relevant ads (see section 4).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">4. Google AdSense & Advertising</h2>
          <p className="mb-3">
            CalcProfit uses Google AdSense to display advertisements. Google AdSense uses cookies to serve ads
            based on your prior visits to our website or other websites. Google&apos;s use of advertising cookies
            enables it and its partners to serve ads based on your visit to our site and/or other sites on the Internet.
          </p>
          <p className="mb-3">
            You may opt out of personalized advertising by visiting{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
              Google Ads Settings
            </a>{" "}
            or{" "}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
              aboutads.info
            </a>.
          </p>
          <p>
            Google&apos;s privacy policy is available at{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
              https://policies.google.com/privacy
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">5. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>To operate and improve the website and calculators</li>
            <li>To analyse usage patterns and improve user experience</li>
            <li>To serve relevant, non-intrusive advertisements</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">6. Third-Party Services</h2>
          <p>
            We may use third-party services including Google Analytics, Google AdSense, and Vercel (hosting).
            These services may collect information about you in accordance with their own privacy policies.
            We encourage you to review their policies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">7. Data Retention</h2>
          <p>
            We do not store personal data on our servers. Analytics data collected by Google Analytics is
            retained in accordance with Google&apos;s data retention policies (typically 14 months by default).
            Your cookie consent preference is stored in your browser&apos;s localStorage until you clear it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">8. Your Rights (GDPR / CCPA)</h2>
          <p className="mb-3">
            Depending on your location, you may have the following rights regarding your personal data:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>The right to access personal data we hold about you</li>
            <li>The right to request correction of inaccurate data</li>
            <li>The right to request deletion of your data</li>
            <li>The right to object to processing</li>
            <li>The right to opt out of the sale of personal information (CCPA)</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--color-primary)] hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">9. Children&apos;s Privacy</h2>
          <p>
            CalcProfit is not directed to children under the age of 13. We do not knowingly collect personal
            information from children. If you believe a child has provided personal information, contact us and
            we will promptly delete it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page with an
            updated &ldquo;Last updated&rdquo; date. Continued use of the site after changes constitutes acceptance
            of the revised policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">11. Contact</h2>
          <p>
            For privacy-related questions, contact us at:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--color-primary)] hover:underline">{CONTACT_EMAIL}</a>
          </p>
        </section>

      </div>
    </div>
  );
}
