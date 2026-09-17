"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  Share2,
} from "lucide-react";

import { useEffect, useState } from "react";

interface Props {
  slug: string;
  title: string;
}

export function CalculatorPageActions({
  slug,
  title,
}: Props) {
  const [favorite, setFavorite] = useState(false);
  const [copied, setCopied] = useState(false);

  /*
   * Load favorite status.
   */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(
        "calculator-favorites"
      );

      if (!stored) return;

      const favorites = JSON.parse(stored);

      if (
        Array.isArray(favorites) &&
        favorites.includes(slug)
      ) {
        setFavorite(true);
      }
    } catch {
      // Ignore malformed localStorage.
    }
  }, [slug]);

  /*
   * Toggle favorite.
   */
  const toggleFavorite = () => {
    try {
      const stored = localStorage.getItem(
        "calculator-favorites"
      );

      const favorites: string[] = stored
        ? JSON.parse(stored)
        : [];

      const next = favorites.includes(slug)
        ? favorites.filter((item) => item !== slug)
        : [...favorites, slug];

      localStorage.setItem(
        "calculator-favorites",
        JSON.stringify(next)
      );

      setFavorite(next.includes(slug));
    } catch {
      setFavorite((value) => !value);
    }
  };

  /*
   * Share.
   */
  const share = async () => {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: `Use the ${title}`,
          url,
        });

        return;
      }

      await navigator.clipboard.writeText(url);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // User cancelled native share.
    }
  };

  /*
   * Copy link.
   */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <div className="flex flex-wrap gap-2">

      {/* Favorite */}
      <button
        type="button"
        onClick={toggleFavorite}
        aria-pressed={favorite}
        aria-label={
          favorite
            ? "Remove calculator from favorites"
            : "Add calculator to favorites"
        }
        className={[
          "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition",
          favorite
            ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
            : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
        ].join(" ")}
      >
        <Heart
          className="h-4 w-4"
          fill={favorite ? "currentColor" : "none"}
        />

        <span className="hidden sm:inline">
          {favorite ? "Saved" : "Save"}
        </span>
      </button>

      {/* Share */}
      <button
        type="button"
        onClick={share}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 text-sm font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
      >
        {copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}

        <span className="hidden sm:inline">
          {copied ? "Copied" : "Share"}
        </span>
      </button>

      {/* Copy */}
      <button
        type="button"
        onClick={copyLink}
        aria-label="Copy calculator link"
        className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
      >
        <Copy className="h-4 w-4" />
      </button>

    </div>
  );
}