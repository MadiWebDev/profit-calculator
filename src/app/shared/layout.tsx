import type { Metadata } from "next";

// Shared reports are token-gated private pages — never indexed
// (SEO Phase 1). The [token] page is a client component, so the
// noindex lives on this server layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
