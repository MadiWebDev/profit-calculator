import { buildMetadata } from "@/lib/seo";
import { Mail, MessageSquare, Clock } from "lucide-react";

export const metadata = buildMetadata({
  title: "Contact CalcProfit",
  description: "Get in touch with the CalcProfit team. Report a bug, suggest a calculator, or ask a question.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center mb-12">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white mb-5">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-4">Contact Us</h1>
        <p className="text-[var(--color-muted-foreground)] text-lg max-w-lg mx-auto">
          We&apos;d love to hear from you. Bug reports, feature suggestions, partnership enquiries — we read everything.
        </p>
      </div>

      {/* Contact info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
        {[
          {
            icon: Mail,
            title: "Email Us",
            desc: "hello@profitcalc.io",
            note: "Best for general enquiries",
          },
          {
            icon: MessageSquare,
            title: "Bug Reports",
            desc: "bugs@profitcalc.io",
            note: "Calculator errors or UI issues",
          },
          {
            icon: Clock,
            title: "Response Time",
            desc: "1–3 business days",
            note: "We respond to every email",
          },
        ].map(({ icon: Icon, title, desc, note }) => (
          <div
            key={title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-center"
          >
            <Icon className="h-6 w-6 text-[var(--color-primary)] mx-auto mb-3" />
            <p className="font-semibold text-[var(--color-foreground)] mb-1">{title}</p>
            <p className="text-sm text-[var(--color-primary)] mb-1">{desc}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{note}</p>
          </div>
        ))}
      </div>

      {/* Contact form */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8">
        <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-6">Send a Message</h2>
        <form
          action="mailto:hello@profitcalc.io"
          method="get"
          className="space-y-5"
          aria-label="Contact form"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-[var(--color-foreground)]">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[var(--color-foreground)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="subject" className="text-sm font-medium text-[var(--color-foreground)]">
              Subject
            </label>
            <select
              id="subject"
              name="subject"
              className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="">Select a topic</option>
              <option value="bug">Bug report / calculator error</option>
              <option value="feature">Feature suggestion / new calculator</option>
              <option value="partnership">Partnership / advertising enquiry</option>
              <option value="press">Press / media enquiry</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="message" className="text-sm font-medium text-[var(--color-foreground)]">
              Message
            </label>
            <textarea
              id="message"
              name="body"
              required
              rows={5}
              className="flex w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] resize-none"
              placeholder="Describe your question or feedback in detail..."
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-primary)] px-6 text-sm font-medium text-white hover:bg-green-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}
