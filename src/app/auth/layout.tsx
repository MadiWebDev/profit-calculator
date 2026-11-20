import type { Metadata } from "next";

// Auth pages are private utility pages — never indexed (SEO Phase 1).
// The auth pages are client components, so the noindex lives on this
// server layout, which covers every /auth/* route.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
