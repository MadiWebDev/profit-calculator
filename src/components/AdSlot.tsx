"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type AdPosition = "in-content" | "sidebar" | "leaderboard" | "rectangle";

interface AdSlotProps {
  position: AdPosition;
  className?: string;
  /** AdSense ad-slot ID for this placement */
  adSlotId?: string;
}

const sizeMap: Record<AdPosition, string> = {
  leaderboard: "min-h-[90px] w-full max-w-[728px]",
  rectangle:   "min-h-[250px] w-full max-w-[336px]",
  sidebar:     "min-h-[250px] w-full",
  "in-content":"min-h-[90px] w-full",
};

/**
 * AdSlot — reserved ad placement with fixed min-height to prevent CLS.
 * Publisher ID: ca-pub-4860681021797211
 * Replace adSlotId with the real slot ID from your AdSense dashboard.
 */
export function AdSlot({ position, className, adSlotId }: AdSlotProps) {
  const ref = React.useRef<HTMLModElement>(null);

  React.useEffect(() => {
    if (!adSlotId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded yet — safe to ignore
    }
  }, [adSlotId]);

  return (
    <div
      aria-label="Advertisement"
      className={cn(
        "ad-slot flex items-center justify-center rounded-lg overflow-hidden",
        sizeMap[position],
        "bg-[var(--color-muted)] border border-dashed border-[var(--color-border)]",
        className
      )}
    >
      {adSlotId ? (
        <ins
          ref={ref}
          className="adsbygoogle"
          style={{ display: "block", width: "100%", height: "100%" }}
          data-ad-client="ca-pub-4860681021797211"
          data-ad-slot={adSlotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <span className="text-xs text-[var(--color-muted-foreground)] select-none pointer-events-none">
          Ad
        </span>
      )}
    </div>
  );
}
