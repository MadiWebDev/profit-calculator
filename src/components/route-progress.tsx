"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Global top progress bar, mounted once inside `Providers` so it renders
 * on every page.
 *
 * Next.js 16 App Router has no router events, so navigation is detected
 * two ways:
 *  1. Clicks on internal `<a>` links (capture phase on `document`) —
 *     the bar appears within ~100 ms of the click (the handler is
 *     synchronous; it starts at 8% immediately).
 *  2. `usePathname()` changes — the new route has rendered, so the bar
 *     jumps to 100% and fades out.
 *
 * Ignored clicks: same-page anchors, external links, new-tab / modifier
 * clicks, download links, and links to the current URL.
 *
 * The bar is the existing `ui/progress.tsx` Radix component (value 0 →
 * ~90 trickling → 100 on complete). Its indicator moves with
 * `transform` only, never width, so it causes no layout shift.
 *
 * LIMITS (deliberate): query-only navigations (`?page=2` on the same
 * pathname) do not move the bar — `useSearchParams` would force every
 * route to opt out of static rendering, which is not worth a progress
 * bar. Those navigations are covered by `loading.tsx` skeletons instead.
 * Programmatic `router.push()` calls without a click also do not start
 * the bar.
 *
 * `prefers-reduced-motion`: no trickle, no fade — the bar appears,
 * jumps to 100% on completion, and disappears.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  // Keep the ref in sync (declared before the pathname effect below, so
  // that effect always reads the current value).
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const stopTrickle = () => {
    if (trickleRef.current !== null) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  };
  const clearHideTimer = () => {
    if (hideRef.current !== null) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  };

  const start = () => {
    clearHideTimer();
    stopTrickle();
    setFading(false);
    setProgress(8);
    if (reducedMotionRef.current) return;
    // Creep toward 90%; completion (100%) only happens when the new
    // route actually renders.
    trickleRef.current = setInterval(() => {
      setProgress((p) => {
        if (p === null || p >= 90) return p;
        return Math.min(90, p + Math.max(1, (90 - p) * 0.08));
      });
    }, 250);
  };

  const complete = () => {
    stopTrickle();
    setProgress(100);
    if (reducedMotionRef.current) {
      hideRef.current = setTimeout(() => setProgress(null), 50);
      return;
    }
    hideRef.current = setTimeout(() => {
      setFading(true);
      hideRef.current = setTimeout(() => {
        setProgress(null);
        setFading(false);
      }, 300);
    }, 150);
  };

  // Start on internal link clicks.
  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (target.hasAttribute("download")) return;
      if (target.getAttribute("target") === "_blank") return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same URL (pathname + search): no navigation will happen.
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      stopTrickle();
      clearHideTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Complete when the new route renders (pathname changed).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (progressRef.current !== null) complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (progress === null) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 transition-opacity duration-300 motion-reduce:transition-none",
        fading ? "opacity-0" : "opacity-100",
      )}
    >
      <Progress
        value={progress}
        className="h-0.5 w-full rounded-none border-0 bg-transparent"
      />
    </div>
  );
}
