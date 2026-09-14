"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { CurrencyProvider } from "@/components/dashboard/CurrencyContext";

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
