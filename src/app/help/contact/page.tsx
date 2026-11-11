import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { SUPPORT_BUGS_EMAIL, SUPPORT_EMAIL, SUPPORT_RESPONSE_TIME } from "@/lib/support";
import { Mail, MessageSquare, Clock } from "lucide-react";
import { SupportForm } from "./SupportForm";

export const metadata = buildMetadata({
  title: "Contact Support",
  description:
    "Contact GetProfitCalc support — billing, store connections, ad-account sync, or a wrong number. We aim to reply within 1–3 business days.",
  path: "/help/contact",
});

export default function HelpContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center mb-12">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white mb-5">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Contact support</h1>
        <p className="text-[var(--color-muted-foreground)] text-lg max-w-lg mx-auto">
          Billing questions, a store that won&apos;t connect, an ad account showing an error, or a number that
          looks wrong — tell us what happened and we&apos;ll dig in.
        </p>
      </div>

      {/* Contact info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
        {[
          {
            icon: Mail,
            title: "Email Us",
            desc: SUPPORT_EMAIL,
            note: "General enquiries & billing",
          },
          {
            icon: MessageSquare,
            title: "Bug Reports",
            desc: SUPPORT_BUGS_EMAIL,
            note: "Calculator errors or wrong numbers",
          },
          {
            icon: Clock,
            title: "Response Time",
            desc: SUPPORT_RESPONSE_TIME,
            note: "We respond to every message",
          },
        ].map(({ icon: Icon, title, desc, note }) => (
          <div
            key={title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-center"
          >
            <Icon className="h-6 w-6 text-[var(--color-primary)] mx-auto mb-3" />
            <p className="font-semibold text-[var(--color-foreground)] mb-1">{title}</p>
            <p className="text-sm text-[var(--color-primary)] mb-1 break-all">{desc}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{note}</p>
          </div>
        ))}
      </div>

      {/* Support form — recorded in the database and emailed to support */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8">
        <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-6">Send a Message</h2>
        <SupportForm />
      </div>

      <p className="mt-6 text-sm text-[var(--color-muted-foreground)] text-center">
        Looking for answers first? Try the{" "}
        <Link href="/help/faq" className="text-[var(--color-primary)] hover:underline">
          FAQ
        </Link>{" "}
        or the{" "}
        <Link href="/help/getting-started" className="text-[var(--color-primary)] hover:underline">
          getting-started guides
        </Link>
        .
      </p>
    </div>
  );
}
