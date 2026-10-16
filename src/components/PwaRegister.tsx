"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => logger.info("[SW] Registered", { scope: reg.scope }))
        .catch((err) => logger.warn("[SW] Registration failed", { error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  return null;
}
