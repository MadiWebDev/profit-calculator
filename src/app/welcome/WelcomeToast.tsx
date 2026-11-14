"use client";

/**
 * WelcomeToast — post-checkout success toast for /welcome.
 *
 * /welcome is the post-checkout success page by design (see page.tsx):
 * Paddle redirects here after a successful payment and it is also the
 * target of the checkout.completed redirect. Nothing else in the app
 * links here, so the page itself is the success signal — no query param
 * or storage flag is needed.
 *
 * The toast fires on mount, AFTER the redirect lands — a toast fired
 * before navigation (in the checkout.completed listener) would vanish
 * with the page change.
 */

import { useEffect } from "react";
import { toast } from "sonner";

export function WelcomeToast() {
  useEffect(() => {
    toast.success("Payment successful — your subscription is now active.");
  }, []);

  return null;
}
