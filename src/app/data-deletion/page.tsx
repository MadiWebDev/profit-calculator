import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Data Deletion Instructions",
  description: "How to request deletion of your personal data from GetProfitCalc.",
  path: "/data-deletion",
});

const CONTACT_EMAIL = "hello@getprofitcalc.com";
const LAST_UPDATED = "September 19, 2026";

export default function DataDeletionPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-2">
        Data Deletion Instructions
      </h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-10">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-10 text-[var(--color-muted-foreground)] leading-relaxed">

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            Your Right to Data Deletion
          </h2>
          <p>
            You have the right to request the deletion of any personal data that GetProfitCalc
            has collected about you. This includes data collected through our platform, integrations
            with third-party services (such as Facebook / Meta), and any account information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            What Data We Hold
          </h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Account information (name, email address)</li>
            <li>Connected ad account tokens (Facebook, TikTok, Google Ads)</li>
            <li>Store and order data synced from Shopify</li>
            <li>Dashboard settings and preferences</li>
            <li>Usage and analytics data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            How to Request Data Deletion
          </h2>
          <p className="mb-4">
            To request deletion of your data, you can use any of the following methods:
          </p>

          <div className="space-y-4">
            <div className="border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="font-semibold text-[var(--color-foreground)] mb-1">
                Option 1: Delete Your Account
              </h3>
              <p>
                Log in to your GetProfitCalc account, go to{" "}
                <strong className="text-[var(--color-foreground)]">Settings → Account</strong>, and
                click <strong className="text-[var(--color-foreground)]">Delete Account</strong>.
                This will permanently remove all your data from our systems.
              </p>
            </div>

            <div className="border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="font-semibold text-[var(--color-foreground)] mb-1">
                Option 2: Email Us
              </h3>
              <p>
                Send a deletion request to{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Data Deletion Request`}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                with the subject line <strong className="text-[var(--color-foreground)]">Data Deletion Request</strong>.
                Include the email address associated with your account. We will process your request
                within <strong className="text-[var(--color-foreground)]">30 days</strong>.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            Facebook / Meta Data
          </h2>
          <p className="mb-3">
            If you connected your Facebook account or Meta ad accounts to GetProfitCalc, we store
            an access token to retrieve your ad performance data. To revoke this access and delete
            the associated data:
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>
              Go to your{" "}
              <a
                href="https://www.facebook.com/settings?tab=applications"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-primary)] hover:underline"
              >
                Facebook App Settings
              </a>
            </li>
            <li>Find <strong className="text-[var(--color-foreground)]">GetProfitCalc</strong> in the list</li>
            <li>Click <strong className="text-[var(--color-foreground)]">Remove</strong> to revoke access</li>
            <li>
              Then email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Data Deletion Request - Facebook`}
                className="text-[var(--color-primary)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              to confirm deletion of any stored tokens
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">
            What Happens After Deletion
          </h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Your account and all associated data will be permanently deleted</li>
            <li>Connected ad account tokens will be revoked and removed</li>
            <li>Backups containing your data will be purged within 90 days</li>
            <li>You will receive a confirmation email once deletion is complete</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3">Contact</h2>
          <p>
            For any questions about data deletion, contact us at:{" "}
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
