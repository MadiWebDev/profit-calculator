import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";
import { ConsentScripts } from "@/components/ConsentScripts";
import { PwaRegister } from "@/components/PwaRegister";
import { PaddleWarmer } from "@/components/PaddleWarmer";
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
  verification: { google: "google77fce3f57266cc5a" },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/getprofitcalc.png', type: 'image/png' }],
    shortcut: [{ url: '/getprofitcalc.png', type: 'image/png' }],
    apple: [{ url: '/getprofitcalc.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paddle checkout — warm the CDN connection + script early so the
            overlay is ready by the time the user reaches Subscribe. The
            script URL must match @paddle/paddle-js's PaddleBillingCDNUrl
            exactly, or the browser fetches it twice. */}
        <link rel="preconnect" href="https://cdn.paddle.com" />
        <link
          rel="preload"
          as="script"
          href="https://cdn.paddle.com/paddle/v2/paddle.js"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#22c55e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GetProfitCalc" />
        <link rel="apple-touch-icon" href="/getprofitcalc.png" />
        {/* Google AdSense verification */}
        <meta name="google-adsense-account" content="ca-pub-4860681021797211" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4860681021797211"
          crossOrigin="anonymous"
        />
      </head>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)] antialiased`}>
        {/* Google Analytics loads only after cookie consent — see ConsentScripts */}
        <ConsentScripts />
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:rounded-md focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <CookieConsent />
          <PwaRegister />
          {/* Warm Paddle.js on first app mount — the singleton in
              @/lib/paddle-init downloads the script once and shares the
              instance across navigations. */}
          <PaddleWarmer />
        </Providers>
      </body>
    </html>
  );
}
