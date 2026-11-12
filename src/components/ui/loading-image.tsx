"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `LoadingImage` — the shared image wrapper (Phase 1b). A skeleton
 * placeholder (same box as the final image, no layout jump) until the
 * image loads, then a fade-in; a muted fallback icon if the load fails.
 *
 * Pass the sizing on `wrapperClassName` so the skeleton reserves the
 * same space as the image; the image's own `className` is unchanged.
 * Do NOT use it for logos (Navbar/Footer) — content images only
 * (blog covers, product thumbnails, editor previews).
 */
export function LoadingImage({
  wrapperClassName,
  className,
  alt,
  onLoad,
  onError,
  ...props
}: ImageProps & { wrapperClassName?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new `src` starts loading again — otherwise the old image's
  // `loaded` state would hide the skeleton for the new one. Reset during
  // render (the documented "adjusting state when a prop changes"
  // pattern), not in an effect.
  const [prevSrc, setPrevSrc] = useState(props.src);
  if (props.src !== prevSrc) {
    setPrevSrc(props.src);
    setLoaded(false);
    setFailed(false);
  }

  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-[var(--color-muted)]",
        wrapperClassName,
      )}
    >
      {!loaded && !failed && (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-[var(--color-muted)]" />
      )}
      {failed ? (
        <span
          className="absolute inset-0 flex items-center justify-center text-[var(--color-muted-foreground)]"
          role="img"
          aria-label={alt ? `${alt} (image failed to load)` : "Image failed to load"}
        >
          <ImageIcon className="h-6 w-6" />
        </span>
      ) : (
        <Image
          {...props}
          alt={alt}
          className={cn(
            className,
            "transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={(e) => {
            setFailed(true);
            onError?.(e);
          }}
        />
      )}
    </span>
  );
}
