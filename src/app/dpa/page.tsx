import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Data Processing Addendum",
  description: "GetProfitCalc data processing addendum — how we process merchant and store data on your behalf, our security measures, and sub-processor categories.",
  path: "/dpa",
});

const LAST_UPDATED = "October 29, 2026";
const CONTACT_EMAIL = "hello@getprofitcalc.com";

/**
 * Data Processing Addendum (DPA). This is a real commitment document, not
 * a template: every measure it names maps to something the product
 * actually does (AES-256-GCM credential/token encryption with key
 * rotation, per-team data isolation, audit logging, GDPR webhook
 * handlers for Shopify customers/redact/shop/redact). Sub-processors
 * are named by category; the full named list is available on request
 * because the set changes as integrations are added — it is not
 * hard-coded here where it would silently go stale.
 */
export default function DpaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">Data Processing Addendum</h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">1. Roles and scope</h2>
          <p>
            When you connect a store to GetProfitCalc, you (the merchant) are the controller of your
            store data and GetProfitCalc is your processor. We process store data only to provide the
            profit-tracking service you signed up for: syncing orders, products, and ad spend;
            computing profit, margins, and reports; and sending the alerts and reports you configure.
            We do not sell store data, and we do not use it to train models or to advertise to your
            customers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">2. What we process</h2>
          <p>
            Order-level data (order totals, line items, discounts, refunds, and fees), product and
            variant cost data you enter or sync, ad-account spend and attribution data, and the
            account details needed to run your workspace (team members, roles, and notification
            preferences). Customer personal data is kept to the minimum the service needs: we store
            order-level customer email and platform customer identifiers for attribution and
            support, and we do not maintain a separate customer marketing database.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">3. Security measures</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Store access tokens and integration secrets are encrypted at rest (AES-256-GCM with a versioned keyring and rotation support) and are never logged.</li>
            <li>Data is strictly isolated per team: every query is scoped to the requesting team, and cross-team access is denied by default.</li>
            <li>Authentication supports password login with brute-force lockout, optional TOTP two-factor authentication, trusted devices, and session revocation.</li>
            <li>Security-relevant actions are written to an audit log your team can review.</li>
            <li>Access to production data is limited to what is needed to operate the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">4. Sub-processors</h2>
          <p>
            We use sub-processors only for the functions the service needs: hosting and database,
            payment processing, transactional email, and the advertising and commerce platforms you
            choose to connect (Shopify, Meta, Google, TikTok, and other ad platforms). A current named
            list is available on request at {CONTACT_EMAIL}; we will notify you of material changes
            to sub-processors that handle your store data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">5. Data subject and GDPR requests</h2>
          <p>
            For Shopify stores, we honour the platform&apos;s mandatory webhooks: customer data
            requests are answered with an export of the data we hold for that customer, customer
            redaction removes the customer&apos;s email from our order records, and shop redaction
            deletes the shop&apos;s orders and products and wipes its tokens. You can also request
            export or deletion of your workspace data at any time by contacting us at {CONTACT_EMAIL};
            account deletion follows a 14-day grace period, after which data is hard-deleted.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">6. Breach notification and assistance</h2>
          <p>
            If we become aware of a personal data breach affecting your store data, we will notify
            you without undue delay and provide the information reasonably needed for you to meet
            your own notification duties. We will reasonably assist with data protection impact
            assessments and with responding to data subject requests.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">7. Return and deletion</h2>
          <p>
            On termination of your subscription, your workspace data is retained only for the
            account-deletion grace period and legal obligations that apply, then deleted. You can
            export your reports (CSV/PDF) at any time before deletion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">8. Contact</h2>
          <p>
            Questions about this addendum: {CONTACT_EMAIL}. This addendum forms part of our Terms of
            Service; in case of conflict between this addendum and the Terms on data protection
            matters, this addendum prevails.
          </p>
        </section>
      </div>
    </div>
  );
}
