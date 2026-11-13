/**
 * paddle-pricing.test.ts — unit tests for the server-side cached Paddle
 * preview (src/lib/paddle-pricing.ts), the shared price-map builder
 * (src/lib/paddle-price-map.ts) and the client session cache
 * (src/lib/paddle-prices-client.ts).
 *
 * Pure helpers + an injectable fetcher/clock — no route imports, no
 * network, no database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPriceMap,
  buildPriceCacheKey,
  allPriceIds,
  extractCurrencySymbol,
  type PriceMap,
  type PreviewLineItem,
} from "@/lib/paddle-price-map";
import {
  createPricePreviewCache,
  getCachedPricePreview,
  PRICE_PREVIEW_TTL_MS,
  PRICE_PREVIEW_STALE_MS,
} from "@/lib/paddle-pricing";
import {
  buildClientPricesCacheKey,
  readSessionPrices,
  writeSessionPrices,
  fetchServerPrices,
} from "@/lib/paddle-prices-client";
import type { SerializedTier } from "@/lib/tiers";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TIERS: SerializedTier[] = [
  {
    id: "starter",
    name: "Starter",
    description: "",
    features: [],
    priceId: {
      month: "pri_starter_m",
      quarter: "pri_starter_q",
      semiannual: "pri_starter_s",
      year: "pri_starter_y",
    },
  },
  {
    id: "growth",
    name: "Growth",
    description: "",
    features: [],
    priceId: {
      month: "pri_growth_m",
      quarter: "pri_growth_q",
      semiannual: "pri_growth_s",
      year: "pri_growth_y",
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "",
    features: [],
    priceId: {
      month: "pri_pro_m",
      quarter: "pri_pro_q",
      semiannual: "pri_pro_s",
      year: "pri_pro_y",
    },
  },
];

const PRICE_IDS = allPriceIds(TIERS);

function lineItem(
  priceId: string,
  formattedTotal: string,
  subtotalMinor: string
): PreviewLineItem {
  return { priceId, formattedTotal, subtotalMinor };
}

const FULL_ITEMS: PreviewLineItem[] = [
  lineItem("pri_starter_m", "$3.00", "300"),
  lineItem("pri_starter_q", "$8.10", "810"),
  lineItem("pri_starter_s", "$15.30", "1530"),
  lineItem("pri_starter_y", "$28.80", "2880"),
  lineItem("pri_growth_m", "$18.00", "1800"),
  lineItem("pri_growth_q", "$48.60", "4860"),
  lineItem("pri_growth_s", "$91.80", "9180"),
  lineItem("pri_growth_y", "$172.80", "17280"),
  lineItem("pri_pro_m", "$29.00", "2900"),
  lineItem("pri_pro_q", "$78.30", "7830"),
  lineItem("pri_pro_s", "$147.90", "14790"),
  lineItem("pri_pro_y", "$278.40", "27840"),
];

function mapFor(): PriceMap {
  return buildPriceMap(TIERS, FULL_ITEMS, "USD");
}

// ── buildPriceMap ─────────────────────────────────────────────────────────────

describe("buildPriceMap", () => {
  it("maps all 12 tier/interval keys", () => {
    const map = buildPriceMap(TIERS, FULL_ITEMS, "USD");
    expect(Object.keys(map)).toHaveLength(12);
    expect(map["starter_month"]).toEqual({
      total: "$3.00",
      perMonth: "$3.00",
      currencyCode: "USD",
    });
    expect(map["pro_year"]).toEqual({
      total: "$278.40",
      perMonth: "$23.20",
      currencyCode: "USD",
    });
  });

  it("derives per-month from the raw subtotal, not the formatted total", () => {
    const map = buildPriceMap(TIERS, FULL_ITEMS, "USD");
    // $8.10 / 3 months = $2.70; $28.80 / 12 = $2.40
    expect(map["starter_quarter"].perMonth).toBe("$2.70");
    expect(map["starter_year"].perMonth).toBe("$2.40");
    // $91.80 / 6 = $15.30; $172.80 / 12 = $14.40
    expect(map["growth_semiannual"].perMonth).toBe("$15.30");
    expect(map["growth_year"].perMonth).toBe("$14.40");
  });

  it("ignores line items whose priceId matches no tier", () => {
    const map = buildPriceMap(
      TIERS,
      [lineItem("pri_unknown", "$99.00", "9900")],
      "USD"
    );
    expect(map).toEqual({});
  });

  it("returns an empty map for no line items", () => {
    expect(buildPriceMap(TIERS, [], "USD")).toEqual({});
  });

  it("passes the preview currency code through to every entry", () => {
    const map = buildPriceMap(
      TIERS,
      [lineItem("pri_starter_m", "€2.75", "275")],
      "EUR"
    );
    expect(map["starter_month"].currencyCode).toBe("EUR");
  });
});

describe("extractCurrencySymbol", () => {
  it("handles leading symbols", () => {
    expect(extractCurrencySymbol("$9.00")).toBe("$");
    expect(extractCurrencySymbol("£7.99")).toBe("£");
    expect(extractCurrencySymbol("Rs 1,000.00")).toBe("Rs");
  });

  it("handles trailing symbols", () => {
    expect(extractCurrencySymbol("9,00 €")).toBe("€");
  });
});

describe("buildPriceCacheKey", () => {
  it("is stable for the same inputs", () => {
    expect(buildPriceCacheKey("US", PRICE_IDS)).toBe(
      buildPriceCacheKey("US", PRICE_IDS)
    );
  });

  it("differs per country and per price-ID set", () => {
    expect(buildPriceCacheKey("US", PRICE_IDS)).not.toBe(
      buildPriceCacheKey("PK", PRICE_IDS)
    );
    expect(buildPriceCacheKey("US", PRICE_IDS)).not.toBe(
      buildPriceCacheKey("US", [...PRICE_IDS, "pri_extra"])
    );
  });

  it("normalises a missing country to AUTO", () => {
    expect(buildPriceCacheKey(undefined, PRICE_IDS)).toContain(":AUTO:");
  });
});

// ── Cache (factory with fake fetcher + clock) ─────────────────────────────────

describe("createPricePreviewCache", () => {
  let now: number;
  let fetchCount: number;
  let currentMap: PriceMap;

  beforeEach(() => {
    now = 1_000_000;
    fetchCount = 0;
    currentMap = mapFor();
  });

  function makeCache(
    fetcher: (country: string | undefined) => Promise<PriceMap> = async () => {
      fetchCount += 1;
      return currentMap;
    }
  ) {
    return createPricePreviewCache({ fetchPreview: fetcher, now: () => now });
  }

  it("fetches once on a cold cache and serves the cached map while fresh", async () => {
    const cache = makeCache();
    const first = await cache.get("US");
    expect(first).toEqual(currentMap);
    expect(fetchCount).toBe(1);

    now += PRICE_PREVIEW_TTL_MS - 1000;
    const second = await cache.get("US");
    expect(second).toEqual(currentMap);
    expect(fetchCount).toBe(1);
  });

  it("refetches after the TTL expires", async () => {
    const cache = makeCache();
    await cache.get("US");
    expect(fetchCount).toBe(1);

    now += PRICE_PREVIEW_TTL_MS + 1000;
    // Still within the stale window: returns stale immediately, refreshes behind.
    const stale = await cache.get("US");
    expect(stale).toEqual(currentMap);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCount).toBe(2);
  });

  it("dedups concurrent cold requests into ONE underlying fetch", async () => {
    const cache = makeCache();
    const results = await Promise.all([
      cache.get("US"),
      cache.get("US"),
      cache.get("US"),
      cache.get("US"),
      cache.get("US"),
    ]);
    expect(fetchCount).toBe(1);
    for (const r of results) expect(r).toEqual(currentMap);
  });

  it("stale-while-revalidate: serves stale instantly, then serves the refresh", async () => {
    const cache = makeCache();
    await cache.get("US");
    expect(fetchCount).toBe(1);

    // Move past the TTL: stage a NEW map, then the next get returns the
    // OLD map at once while the background refresh fetches the new one.
    now += PRICE_PREVIEW_TTL_MS + 1000;
    const newMap = buildPriceMap(
      TIERS,
      [lineItem("pri_starter_m", "$4.00", "400")],
      "USD"
    );
    currentMap = newMap;
    const stale = await cache.get("US");
    expect(stale).toEqual(mapFor());

    // ...while the background refresh fetches the NEW map.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCount).toBe(2);

    const fresh = await cache.get("US");
    expect(fresh).toEqual(newMap);
    expect(fetchCount).toBe(2);
  });

  it("keeps separate entries per country", async () => {
    const cache = makeCache();
    await cache.get("US");
    await cache.get("PK");
    expect(fetchCount).toBe(2);
    await cache.get("US");
    expect(fetchCount).toBe(2);
  });

  it("returns null when the fetcher throws and nothing is cached", async () => {
    const cache = makeCache(async () => {
      fetchCount += 1;
      throw new Error("Paddle down");
    });
    await expect(cache.get("US")).resolves.toBeNull();
    expect(fetchCount).toBe(1);
  });

  it("serves stale data when a refresh fails", async () => {
    let failNext = false;
    const cache = makeCache(async () => {
      fetchCount += 1;
      if (failNext) throw new Error("Paddle down");
      return currentMap;
    });
    await cache.get("US");
    now += PRICE_PREVIEW_TTL_MS + 1000;
    failNext = true;
    const stale = await cache.get("US");
    expect(stale).toEqual(currentMap);
    await new Promise((r) => setTimeout(r, 10));
    // Failed refresh keeps the old fetchedAt, so the next call retries.
    const retried = await cache.get("US");
    expect(retried).toEqual(currentMap);
    expect(fetchCount).toBe(3);
  });

  it("does not serve data older than the stale window — it awaits a fresh fetch", async () => {
    const cache = makeCache();
    await cache.get("US");
    now += PRICE_PREVIEW_STALE_MS + 1000;
    const fresh = await cache.get("US");
    expect(fresh).toEqual(currentMap);
    expect(fetchCount).toBe(2);
  });
});

// ── Degradation: no API key → null ────────────────────────────────────────────

describe("getCachedPricePreview without PADDLE_API_KEY", () => {
  const originalKey = process.env.PADDLE_API_KEY;

  beforeEach(() => {
    delete process.env.PADDLE_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PADDLE_API_KEY;
    else process.env.PADDLE_API_KEY = originalKey;
  });

  it("returns null instead of throwing", async () => {
    await expect(getCachedPricePreview("US")).resolves.toBeNull();
    await expect(getCachedPricePreview(undefined)).resolves.toBeNull();
  });
});

// ── Client session cache ──────────────────────────────────────────────────────

describe("session price cache", () => {
  function fakeStorage(): Pick<Storage, "getItem" | "setItem"> & {
    store: Map<string, string>;
  } {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
  }

  it("round-trips a map through session storage", () => {
    const storage = fakeStorage();
    const map = mapFor();
    writeSessionPrices("US", PRICE_IDS, map, storage);
    expect(readSessionPrices("US", PRICE_IDS, storage)).toEqual(map);
  });

  it("misses for a different country or different price IDs", () => {
    const storage = fakeStorage();
    writeSessionPrices("US", PRICE_IDS, mapFor(), storage);
    expect(readSessionPrices("PK", PRICE_IDS, storage)).toBeNull();
    expect(
      readSessionPrices("US", [...PRICE_IDS, "pri_extra"], storage)
    ).toBeNull();
  });

  it("returns null for expired, corrupt, or misshapen entries", () => {
    const storage = fakeStorage();
    const key = buildClientPricesCacheKey("US", PRICE_IDS);
    storage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now() - 2 * 60 * 60 * 1000, prices: mapFor() })
    );
    expect(readSessionPrices("US", PRICE_IDS, storage)).toBeNull();

    storage.setItem(key, "{not json");
    expect(readSessionPrices("US", PRICE_IDS, storage)).toBeNull();

    storage.setItem(key, JSON.stringify({ savedAt: Date.now(), prices: { bad: 1 } }));
    expect(readSessionPrices("US", PRICE_IDS, storage)).toBeNull();
  });

  it("returns null without storage (server render)", () => {
    expect(readSessionPrices("US", PRICE_IDS, null)).toBeNull();
    expect(() =>
      writeSessionPrices("US", PRICE_IDS, mapFor(), null)
    ).not.toThrow();
  });
});

// ── fetchServerPrices ─────────────────────────────────────────────────────────

describe("fetchServerPrices", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the map on a 200 with prices", async () => {
    const map = mapFor();
    globalThis.fetch = vi.fn(async () =>
      Response.json({ prices: map, country: "US" })
    ) as unknown as typeof fetch;
    await expect(fetchServerPrices("US")).resolves.toEqual(map);
  });

  it("returns null on 503, bad shape, or a thrown fetch — never throws", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchServerPrices("US")).resolves.toBeNull();

    globalThis.fetch = vi.fn(async () => Response.json({ prices: {} })) as unknown as typeof fetch;
    await expect(fetchServerPrices("US")).resolves.toBeNull();

    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(fetchServerPrices("US")).resolves.toBeNull();
  });
});
