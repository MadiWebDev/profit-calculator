"use client";

import {
  ArrowDownAZ,
  ArrowUp,
  Calculator,
  Check,
  ChevronRight,
  Filter,
  Heart,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalculatorCard } from "@/components/CalculatorCard";
import type { CalculatorConfig } from "@/types/calculator";

type Category = {
  key: CalculatorConfig["category"];
  label: string;
  desc: string;
};

type Props = {
  calculators: CalculatorConfig[];
  categories: Category[];
};

type SortOption = "recommended" | "az" | "category" | "favorites";

export function CalculatorsDirectory({
  calculators,
  categories,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    CalculatorConfig["category"] | "all"
  >("all");

  const [sort, setSort] = useState<SortOption>("recommended");

  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [favorites, setFavorites] = useState<string[]>([]);

  const [showFilters, setShowFilters] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * Load favorites.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        "calculator-favorites"
      );

      if (stored) {
        const parsed = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      }
    } catch {
      // Ignore malformed localStorage values.
    }
  }, []);

  /*
   * Save favorites.
   */
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "calculator-favorites",
        JSON.stringify(favorites)
      );
    } catch {
      // localStorage may be unavailable.
    }
  }, [favorites]);

  /*
   * "/" focuses search.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === "Escape") {
        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /*
   * Toggle favorite.
   */
  const toggleFavorite = (slug: string) => {
    setFavorites((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
  };

  /*
   * Extract searchable information safely.
   *
   * This supports calculator configs that use different naming
   * conventions such as name/title/description/keywords.
   */
  const getSearchText = (calculator: CalculatorConfig) => {
    const item = calculator as CalculatorConfig & {
      name?: string;
      title?: string;
      description?: string;
      keywords?: string[];
    };

    return [
      item.name,
      item.title,
      item.description,
      calculator.slug,
      calculator.category,
      item.keywords?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  };

  /*
   * Get display name safely for sorting.
   */
  const getCalculatorName = (calculator: CalculatorConfig) => {
    const item = calculator as CalculatorConfig & {
      name?: string;
      title?: string;
    };

    return (
      item.name ||
      item.title ||
      calculator.slug
        .split("-")
        .map(
          (word) =>
            word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(" ")
    );
  };

  /*
   * Filter + search + sort.
   */
  const filteredCalculators = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    let result = calculators.filter((calculator) => {
      const matchesCategory =
        activeCategory === "all" ||
        calculator.category === activeCategory;

      const matchesSearch =
        !normalizedQuery ||
        getSearchText(calculator).includes(normalizedQuery);

      const matchesFavorites =
        !favoritesOnly ||
        favorites.includes(calculator.slug);

      return (
        matchesCategory &&
        matchesSearch &&
        matchesFavorites
      );
    });

    result = [...result];

    if (sort === "az") {
      result.sort((a, b) =>
        getCalculatorName(a).localeCompare(
          getCalculatorName(b)
        )
      );
    }

    if (sort === "category") {
      result.sort((a, b) => {
        const categoryCompare = a.category.localeCompare(
          b.category
        );

        if (categoryCompare !== 0) {
          return categoryCompare;
        }

        return getCalculatorName(a).localeCompare(
          getCalculatorName(b)
        );
      });
    }

    if (sort === "favorites") {
      result.sort((a, b) => {
        const aFavorite = favorites.includes(a.slug);
        const bFavorite = favorites.includes(b.slug);

        if (aFavorite !== bFavorite) {
          return aFavorite ? -1 : 1;
        }

        return getCalculatorName(a).localeCompare(
          getCalculatorName(b)
        );
      });
    }

    return result;
  }, [
    calculators,
    query,
    activeCategory,
    favoritesOnly,
    favorites,
    sort,
  ]);

  /*
   * Group filtered results by category.
   */
  const groupedCalculators = useMemo(() => {
    const groups = new Map<
      CalculatorConfig["category"],
      CalculatorConfig[]
    >();

    for (const calculator of filteredCalculators) {
      const existing = groups.get(calculator.category) || [];

      existing.push(calculator);

      groups.set(calculator.category, existing);
    }

    return categories
      .filter((category) => groups.has(category.key))
      .map((category) => ({
        ...category,
        calculators: groups.get(category.key) || [],
      }));
  }, [filteredCalculators, categories]);

  /*
   * Category counts.
   */
  const categoryCounts = useMemo(() => {
    const counts = new Map<
      CalculatorConfig["category"],
      number
    >();

    for (const calculator of calculators) {
      counts.set(
        calculator.category,
        (counts.get(calculator.category) || 0) + 1
      );
    }

    return counts;
  }, [calculators]);

  /*
   * Clear all filters.
   */
  const clearFilters = () => {
    setQuery("");
    setActiveCategory("all");
    setFavoritesOnly(false);
    setSort("recommended");

    searchRef.current?.focus();
  };

  const hasActiveFilters =
    query.trim().length > 0 ||
    activeCategory !== "all" ||
    favoritesOnly ||
    sort !== "recommended";

  /*
   * Scroll to category.
   */
  const scrollToCategory = (
    category: CalculatorConfig["category"] | "all"
  ) => {
    setActiveCategory(category);

    if (category === "all") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    window.setTimeout(() => {
      const element = document.getElementById(
        `calculator-category-${category}`
      );

      element?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  return (
    <section className="relative">
      {/* Sticky directory controls */}
      <div className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          {/* Search */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
              />

              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search calculators..."
                aria-label="Search calculators"
                className="h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] pl-11 pr-20 text-sm text-[var(--color-foreground)] outline-none transition placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
              />

              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-11 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}

              <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--color-muted-foreground)] sm:block">
                /
              </kbd>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setFavoritesOnly((value) => !value)
                }
                aria-pressed={favoritesOnly}
                className={[
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition",
                  favoritesOnly
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                ].join(" ")}
              >
                <Heart
                  className="h-4 w-4"
                  fill={favoritesOnly ? "currentColor" : "none"}
                />

                <span className="hidden sm:inline">
                  Favorites
                </span>

                {favorites.length > 0 ? (
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                    {favorites.length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowFilters((value) => !value)
                }
                aria-expanded={showFilters}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 text-sm font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-muted)]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Filters
                </span>
              </button>
            </div>
          </div>

          {/* Category navigation */}
          <div className="mt-3 -mx-1 overflow-x-auto pb-1 scrollbar-none">
            <div className="flex min-w-max gap-2 px-1">
              <button
                type="button"
                onClick={() => scrollToCategory("all")}
                className={[
                  "rounded-full border px-3.5 py-2 text-xs font-semibold transition",
                  activeCategory === "all"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                ].join(" ")}
              >
                All
                <span className="ml-1.5 opacity-70">
                  {calculators.length}
                </span>
              </button>

              {categories.map((category) => {
                const count =
                  categoryCounts.get(category.key) || 0;

                if (!count) return null;

                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() =>
                      scrollToCategory(category.key)
                    }
                    className={[
                      "rounded-full border px-3.5 py-2 text-xs font-semibold transition",
                      activeCategory === category.key
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                    ].join(" ")}
                  >
                    {category.label}

                    <span className="ml-1.5 opacity-70">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced filters */}
          {showFilters ? (
            <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted-foreground)]">
                  <Filter className="h-4 w-4" />
                  Sort calculators
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      value: "recommended" as const,
                      label: "Recommended",
                    },
                    {
                      value: "az" as const,
                      label: "A–Z",
                    },
                    {
                      value: "category" as const,
                      label: "Category",
                    },
                    {
                      value: "favorites" as const,
                      label: "Favorites first",
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setSort(option.value)
                      }
                      className={[
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                        sort === option.value
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                          : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                      ].join(" ")}
                    >
                      {option.value === "az" ? (
                        <ArrowDownAZ className="h-3.5 w-3.5" />
                      ) : null}

                      {option.value === "favorites" ? (
                        <Star className="h-3.5 w-3.5" />
                      ) : null}

                      {option.label}

                      {sort === option.value ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Results summary */}
          <div className="flex items-center justify-between py-2 text-xs">
            <p className="text-[var(--color-muted-foreground)]">
              Showing{" "}
              <strong className="text-[var(--color-foreground)]">
                {filteredCalculators.length}
              </strong>{" "}
              of{" "}
              <strong className="text-[var(--color-foreground)]">
                {calculators.length}
              </strong>{" "}
              calculators
            </p>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-primary)] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Calculator content */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {filteredCalculators.length === 0 ? (
          <EmptyState
            query={query}
            favoritesOnly={favoritesOnly}
            onClear={clearFilters}
          />
        ) : (
          <div className="space-y-16">
            {groupedCalculators.map((category) => (
              <section
                key={category.key}
                id={`calculator-category-${category.key}`}
                className="scroll-mt-40"
                aria-labelledby={`category-heading-${category.key}`}
              >
                {/* Category heading */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <Calculator className="h-4 w-4" />
                      </div>

                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                        {category.calculators.length}{" "}
                        {category.calculators.length === 1
                          ? "tool"
                          : "tools"}
                      </span>
                    </div>

                    <h2
                      id={`category-heading-${category.key}`}
                      className="text-2xl font-bold tracking-tight text-[var(--color-foreground)] sm:text-3xl"
                    >
                      {category.label}
                    </h2>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-muted-foreground)]">
                      {category.desc}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      window.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      })
                    }
                    className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)] sm:inline-flex"
                  >
                    Back to filters
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {category.calculators.map((calculator) => (
                    <div
                      key={calculator.slug}
                      className="group relative"
                    >
                      {/* Favorite */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleFavorite(calculator.slug)
                        }
                        aria-label={
                          favorites.includes(
                            calculator.slug
                          )
                            ? `Remove ${getCalculatorName(
                                calculator
                              )} from favorites`
                            : `Add ${getCalculatorName(
                                calculator
                              )} to favorites`
                        }
                        aria-pressed={favorites.includes(
                          calculator.slug
                        )}
                        className={[
                          "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200",
                          favorites.includes(
                            calculator.slug
                          )
                            ? "border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "border-[var(--color-border)] bg-[var(--color-card)]/90 text-[var(--color-muted-foreground)] opacity-0 shadow-sm group-hover:opacity-100 hover:text-[var(--color-primary)]",
                        ].join(" ")}
                      >
                        <Heart
                          className="h-4 w-4"
                          fill={
                            favorites.includes(
                              calculator.slug
                            )
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>

                      <CalculatorCard config={calculator} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Floating back-to-top */}
      <button
        type="button"
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          })
        }
        aria-label="Back to top"
        className="fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] shadow-lg transition hover:-translate-y-1 hover:bg-[var(--color-muted)]"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </section>
  );
}

function EmptyState({
  query,
  favoritesOnly,
  onClear,
}: {
  query: string;
  favoritesOnly: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
        <Search className="h-7 w-7" />
      </div>

      <h2 className="mt-5 text-xl font-bold text-[var(--color-foreground)]">
        No calculators found
      </h2>

      <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
        {query
          ? `We couldn't find a calculator matching "${query}". Try a different search term.`
          : favoritesOnly
          ? "You haven't added any calculators to your favorites yet."
          : "Try changing your filters to find the calculator you need."}
      </p>

      <button
        type="button"
        onClick={onClear}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <RotateCcw className="h-4 w-4" />
        Clear filters
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}