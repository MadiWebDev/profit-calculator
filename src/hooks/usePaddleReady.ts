/**
 * usePaddleReady — React view of the shared Paddle.js init readiness.
 *
 * Subscribes (via useSyncExternalStore) to the singleton status in
 * @/lib/paddle-init — "loading" | "ready" | "failed". No second init
 * promise: the status tracks the one shared warmPaddle() promise.
 *
 *   - loading: init is in flight — Subscribe buttons show a loading
 *     state and wait instead of erroring on click.
 *   - ready:   the instance is initialised — buttons activate.
 *   - failed:  init failed or timed out — buttons stay clickable so a
 *     click retries (fast-failing) and shows an honest error toast.
 *
 * The server snapshot is "loading", matching the module's initial state,
 * so hydration agrees with the server render.
 */

import { useSyncExternalStore } from "react";
import {
  getPaddleStatus,
  subscribePaddleStatus,
  type PaddleInitStatus,
} from "@/lib/paddle-init";

export interface PaddleReady {
  status: PaddleInitStatus;
  /** Init settled with a usable instance. */
  ready: boolean;
  /** Init is still in flight. */
  loading: boolean;
  /** Init failed (or the env vars are missing) — a click retries. */
  failed: boolean;
}

export function usePaddleReady(): PaddleReady {
  const status = useSyncExternalStore(
    subscribePaddleStatus,
    getPaddleStatus,
    getPaddleStatus
  );
  return {
    status,
    ready: status === "ready",
    loading: status === "loading",
    failed: status === "failed",
  };
}
