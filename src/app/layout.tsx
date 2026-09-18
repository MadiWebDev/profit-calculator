import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";
import { PwaRegister } from "@/components/PwaRegister";
import { SITE_NAME, SITE_DESCRIPTION, BASE_URL } from "@/lib/seo";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: `${SITE_NAME} — Free Profit & ROI Calculators`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: ["profit calculator", "roi calculator", "ecommerce calculator", "shopify profit", "dropshipping profit", "amazon fba calculator"],
  authors: [{ name: "GetProfitCalc" }],
  creator: "GetProfitCalc",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Free Profit & ROI Calculators`,
    description: SITE_DESCRIPTION,
    images: [{ url: `${BASE_URL}/api/og?title=GetProfitCalc`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@getprofitcalc",
    creator: "@getprofitcalc",
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  verification: { google: "YOUR_GOOGLE_VERIFICATION_CODE" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#22c55e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GetProfitCalc" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] antialiased`}>
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <CookieConsent />
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
