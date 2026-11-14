"use client";

/**
 * PaddleWarmer
 * ────────────
 * Starts the Paddle.js download + initialise on first app mount, so the
 * checkout is usually already ready by the time the user reaches a
 * Subscribe button — instead of initialising on the billing page mount,
 * when the user may click within the first second.
 *
 * Renders nothing. The singleton in @/lib/paddle-init guarantees the
 * script downloads once and the instance is shared across navigations.
 * No-ops on the server and when the Paddle env vars are missing.
 */

import { useEffect } from "react";
import { warmPaddle } from "@/lib/paddle-init";

export function PaddleWarmer() {
  useEffect(() => {
    warmPaddle();
  }, []);

  return null;
}
