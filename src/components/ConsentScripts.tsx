"use client";

/**
 * ConsentScripts — loads third-party measurement scripts only after the
 * visitor grants cookie consent (GDPR/ePrivacy).
 *
 * Subscribes to consent state via useSyncExternalStore: reads the same
 * localStorage key as CookieConsent and re-reads when the
 * "gpc-cookie-consent" event fires, so accepting the banner loads analytics
 * without a page reload. Server snapshot is false (no tracking in SSR HTML).
 */
import { useSyncExternalStore } from "react";
import Script from "next/script";

const STORAGE_KEY = "getprofitcalc_cookie_consent";
const GA_ID = "G-NR4HM5ZR5X";

function hasConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("gpc-cookie-consent", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("gpc-cookie-consent", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ConsentScripts() {
  const consented = useSyncExternalStore(subscribe, hasConsent, () => false);

  if (!consented) return null;

  return (
    <>
      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-config" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
      </Script>
    </>
  );
}
