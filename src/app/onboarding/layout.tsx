import type { Metadata } from "next";

// Onboarding is a private app page — never indexed (SEO Phase 1).
// The page is a client component, so the noindex lives on this server
// layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
