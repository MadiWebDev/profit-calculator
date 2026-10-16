import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Refund Policy",
  description:
    "GetProfitCalc refund policy — our commitment to fair billing, how to request a refund, and what to expect.",
  path: "/refund-policy",
});

const LAST_UPDATED  = "September 19, 2026";
const CONTACT_EMAIL = "hello@getprofitcalc.com";
const SITE_URL      = "https://getprofitcalc.com";

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">
        Refund Policy
      </h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">

        {/* 1 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            1. Overview
          </h2>
          <p>
            GetProfitCalc (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to fair and
            transparent billing. Payments for paid subscription plans are processed securely by{" "}
            <a
              href="https://www.paddle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Paddle.com
            </a>
            , our Merchant of Record. Paddle handles all payment processing, invoicing, and tax
            compliance on our behalf.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            2. Free Trial
          </h2>
          <p>
            All paid plans begin with a <strong className="text-[var(--color-foreground)]">7-day free trial</strong>.
            No credit card is required to start your trial. You will not be charged anything until you
            choose a paid plan after your trial ends. If you do not upgrade, your account is simply
            archived — you are never billed without your consent.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            3. Cancellation
          </h2>
          <p className="mb-3">
            You may cancel your subscription at any time from your account settings under
            <strong className="text-[var(--color-foreground)]"> Dashboard → Settings → Billing &amp; Plan</strong>.
            Cancellation takes effect at the end of your current billing period — you retain full
            access to all paid features until that date.
          </p>
          <p>
            We do not charge cancellation fees. Once your billing period ends, your account reverts
            to an archived state and you will not be billed again.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            4. Refund Eligibility
          </h2>
          <p className="mb-3">
            We offer refunds in the following circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--color-foreground)]">Within 7 days of first payment:</strong>{" "}
              If you are charged for the first time and are not satisfied, contact us within 7 days
              of the charge for a full refund, no questions asked.
            </li>
            <li>
              <strong className="text-[var(--color-foreground)]">Duplicate charges:</strong>{" "}
              If you are charged more than once for the same billing period due to a billing error,
              we will refund the duplicate charge in full.
            </li>
            <li>
              <strong className="text-[var(--color-foreground)]">Service unavailability:</strong>{" "}
              If the platform experiences unplanned downtime exceeding 72 consecutive hours in a
              billing period, you may request a prorated refund for that period.
            </li>
          </ul>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            5. Non-Refundable Circumstances
          </h2>
          <p className="mb-3">
            Refunds are generally not issued in the following situations:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              Renewals where you did not cancel before the billing period ended and the renewal
              was clearly communicated in advance.
            </li>
            <li>
              Partial months — we do not prorate mid-period cancellations except in cases of
              extended service unavailability (see above).
            </li>
            <li>
              Longer-cycle plans (quarterly, semiannual, annual) where the discounted rate was
              applied and more than 7 days have passed since payment.
            </li>
            <li>
              Accounts suspended for violation of our{" "}
              <a
                href={`${SITE_URL}/terms-of-service`}
                className="text-[var(--color-primary)] hover:underline"
              >
                Terms of Service
              </a>
              .
            </li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            6. How to Request a Refund
          </h2>
          <p className="mb-3">
            To request a refund, email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            with the subject line <strong className="text-[var(--color-foreground)]">&ldquo;Refund Request&rdquo;</strong> and include:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>The email address associated with your account</li>
            <li>The date and amount of the charge</li>
            <li>A brief reason for your request (optional but helpful)</li>
          </ul>
          <p className="mt-3">
            We aim to respond to all refund requests within{" "}
            <strong className="text-[var(--color-foreground)]">2 business days</strong>. Approved
            refunds are processed by Paddle and typically appear on your statement within
            5–10 business days, depending on your bank or payment provider.
          </p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            7. Paddle as Merchant of Record
          </h2>
          <p>
            All transactions are processed by Paddle.com, which acts as the Merchant of Record for
            GetProfitCalc. This means Paddle is legally responsible for billing, receipts, and tax
            collection. If you have questions about a specific charge that appears on your statement
            from Paddle, you may also contact{" "}
            <a
              href="https://www.paddle.com/help"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Paddle Support
            </a>{" "}
            directly. For refund requests, however, please contact us first at the address below.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            8. Changes to This Policy
          </h2>
          <p>
            We may update this Refund Policy from time to time. Changes will be posted on this page
            with an updated &ldquo;Last updated&rdquo; date. Continued use of the service after
            changes constitutes acceptance of the revised policy.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            9. Contact
          </h2>
          <p>
            Questions about this policy or a specific charge? Contact us at:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

      </div>
    </div>
  );
}
