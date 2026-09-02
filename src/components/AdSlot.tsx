import * as React from "react";
import { cn } from "@/lib/utils";

type AdPosition = "in-content" | "sidebar" | "leaderboard" | "rectangle";

interface AdSlotProps {
  position: AdPosition;
  className?: string;
  /** Set to true once AdSense script is injected */
  enabled?: boolean;
}

const sizeMap: Record<AdPosition, string> = {
  "leaderboard": "min-h-[90px] w-full max-w-[728px]",
  "rectangle":   "min-h-[250px] w-full max-w-[336px]",
  "sidebar":     "min-h-[250px] w-full",
  "in-content":  "min-h-[90px] w-full",
};

/**
 * AdSlot — reserved ad placement with fixed min-height to prevent CLS.
 * Replace the inner content with real AdSense <ins> tags once approved.
 * Positioned responsibly: never above the fold, never overlapping tools.
 */
export function AdSlot({ position, className, enabled = false }: AdSlotProps) {
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
      {/* 
        Replace this placeholder with your AdSense <ins> tag:
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot="XXXXXXXXXX"
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      */}
      {!enabled && (
        <span className="text-xs text-[var(--color-muted-foreground)] select-none pointer-events-none">
          Ad
        </span>
      )}
    </div>
  );
}
