"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { CurrencyProvider } from "@/components/dashboard/CurrencyContext";

// next-themes injects an inline <script> to prevent theme flicker (FOUC).
// React 19 warns about <script> tags rendered inside components, but this is
// a false positive — the script only runs during SSR and works correctly.
// Suppress the warning in dev until next-themes ships a fix.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const _origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) return;
    _origError(...args);
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        <CurrencyProvider>
          {children}
        </CurrencyProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
        />
      </SessionProvider>
    </ThemeProvider>
  );
}
