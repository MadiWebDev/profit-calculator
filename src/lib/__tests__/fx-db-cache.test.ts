/**
 * DB-backed FX rates snapshot tests.
 *
 * The free currencyapi.net plan allows 500 requests a month, so rates
 * are saved once in MongoDB (one FxRateSnapshot document, shared by
 * every serverless instance) and refreshed every 90 minutes — 16
 * refreshes a day, 480 a month. These tests prove the snapshot layer:
 *  - a fresh snapshot is served with zero provider calls
 *  - a stale snapshot triggers exactly one refresh that REPLACES the
 *    old document (the collection never holds two snapshots)
 *  - a failed refresh never deletes the last good snapshot; the stale
 *    one is served instead
 *  - a cold in-process cache (another serverless instance) is served
 *    from the snapshot, not from a second provider call
 *  - team FX overrides never leak into the shared snapshot
 *
 * DB-backed: run this file on its own (see setup-db.ts); the suite
 * shares ./.mongo-mem with the other DB files.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { getFxRates, clearFxCache, clearFxRateSnapshot, claimFxRefreshLock, releaseFxRefreshLock, waitForFreshSnapshot } from "@/lib/fx";
import { FxRateSnapshotModel } from "@/models/FxRateSnapshot";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";

const CURRENCY_API_PAYLOAD = {
  valid: true,
  updated: 1768586454,
  base: "USD",
  rates: { EUR: 0.92, PKR: 278.5, GBP: 0.79 },
};

const SNAPSHOT_RATES = { USD: 1, EUR: 0.9, PKR: 270, GBP: 0.8 };

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => handler(url)),
  );
}

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function httpError(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

/** Seed a snapshot saved `ageMs` ago (controls the TTL clock, which runs from updatedAt). */
async function seedSnapshot(
  ageMs: number,
  rates: Record<string, number> = SNAPSHOT_RATES,
  source: "currencyapi.net" | "er-api" = "currencyapi.net",
) {
  const savedAt = new Date(Date.now() - ageMs);
  const doc = new FxRateSnapshotModel({
    key: "USD",
    base: "USD",
    rates,
    fetchedAt: savedAt,
    source,
    createdAt: savedAt,
    updatedAt: savedAt,
  });
  await doc.save({ timestamps: false });
  return doc;
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearDb();
  clearFxCache();
  process.env.CURRENCY_API_KEY = "test-key";
  delete process.env.CURRENCY_API_CACHE_TTL_SECONDS;
  delete process.env.CURRENCY_API_LIVE;
});

afterEach(() => {
  clearFxCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CURRENCY_API_KEY;
  delete process.env.CURRENCY_API_CACHE_TTL_SECONDS;
  delete process.env.CURRENCY_API_LIVE;
});

describe("DB snapshot cache", () => {
  it("serves a fresh snapshot without calling the provider, for any base", async () => {
    await seedSnapshot(10 * 60 * 1000); // 10 minutes old
    const fetchMock = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    const usd = await getFxRates("USD");
    expect(usd.rates.EUR).toBe(0.9);
    expect(usd.rates.PKR).toBe(270);
    expect(fetchMock).not.toHaveBeenCalled();

    // Another base re-bases from the same snapshot — still no fetch.
    const eur = await getFxRates("EUR");
    expect(eur.base).toBe("EUR");
    expect(eur.rates.EUR).toBe(1);
    expect(eur.rates.USD).toBeCloseTo(1 / 0.9, 10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a stale snapshot and keeps exactly one document", async () => {
    await seedSnapshot(2 * 60 * 60 * 1000); // 2 hours old
    mockFetch(() => okJson(CURRENCY_API_PAYLOAD));

    const fx = await getFxRates("USD");
    expect(fx.rates.EUR).toBe(0.92);

    const docs = await FxRateSnapshotModel.find({}).lean();
    expect(docs).toHaveLength(1);
    expect((docs[0].rates as Record<string, number>).EUR).toBe(0.92);
    expect((docs[0].rates as Record<string, number>).PKR).toBe(278.5);
    expect(docs[0].source).toBe("currencyapi.net");
  });

  it("serves the stale snapshot when both providers fail — and keeps it", async () => {
    await seedSnapshot(2 * 60 * 60 * 1000);
    mockFetch(() => httpError(503));

    const fx = await getFxRates("USD");
    expect(fx.rates.EUR).toBe(0.9);

    // The failed refresh must NOT delete the last good snapshot.
    expect(await FxRateSnapshotModel.countDocuments()).toBe(1);
  });

  it("throws when there is no snapshot and both providers fail", async () => {
    mockFetch(() => httpError(503));
    await expect(getFxRates("USD")).rejects.toThrow();
    expect(await FxRateSnapshotModel.countDocuments()).toBe(0);
  });

  it("concurrent same-base callers share a single provider fetch", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 50));
      return okJson(CURRENCY_API_PAYLOAD);
    });

    const results = await Promise.all([
      getFxRates("USD"),
      getFxRates("USD"),
      getFxRates("USD"),
      getFxRates("USD"),
      getFxRates("USD"),
    ]);
    expect(calls).toBe(1);
    expect(results[0].rates.EUR).toBe(0.92);
    expect(await FxRateSnapshotModel.countDocuments()).toBe(1);
  });

  it("a cold in-process cache is served from the snapshot (cross-instance)", async () => {
    mockFetch(() => okJson(CURRENCY_API_PAYLOAD));
    await getFxRates("USD");
    expect(await FxRateSnapshotModel.countDocuments()).toBe(1);

    // Simulate another serverless instance: empty in-process cache, and
    // the provider now unreachable.
    clearFxCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider down");
      }),
    );
    const fx = await getFxRates("USD");
    expect(fx.rates.EUR).toBe(0.92);
  });

  it("the default TTL is 90 minutes", async () => {
    await seedSnapshot(89 * 60 * 1000);
    const fetchMock = vi.fn(async () => okJson(CURRENCY_API_PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    await getFxRates("USD");
    expect(fetchMock).not.toHaveBeenCalled();

    await clearFxRateSnapshot();
    clearFxCache();
    await seedSnapshot(91 * 60 * 1000);
    await getFxRates("USD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the er-api fallback persists a USD snapshot", async () => {
    mockFetch((url: string) =>
      url.includes("currencyapi.net")
        ? httpError(500)
        : okJson({ result: "success", base_code: "USD", rates: { USD: 1, EUR: 0.91, PKR: 280 } }),
    );
    const fx = await getFxRates("USD");
    expect(fx.rates.EUR).toBe(0.91);

    const docs = await FxRateSnapshotModel.find({}).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].source).toBe("er-api");
  });

  it("team overrides never pollute the shared snapshot", async () => {
    mockFetch(() => okJson(CURRENCY_API_PAYLOAD));
    const withOverride = await getFxRates("USD", [
      { currency: "PKR", rate: 999, effectiveFrom: "2026-01-01" },
    ]);
    expect(withOverride.rates.PKR).toBe(999);

    const doc = await FxRateSnapshotModel.findOne({ key: "USD" }).lean();
    expect(doc).not.toBeNull();
    expect((doc!.rates as Record<string, number>).PKR).toBe(278.5);

    // A plain call still sees the provider rate, not the override.
    const plain = await getFxRates("USD");
    expect(plain.rates.PKR).toBe(278.5);
  });
});

describe("refresh lock (cross-instance single-flight)", () => {
  it("two concurrent claims yield exactly one holder", async () => {
    const [a, b] = await Promise.all([
      claimFxRefreshLock("instance-a"),
      claimFxRefreshLock("instance-b"),
    ]);
    const held = [a, b].filter((r) => r === "held");
    const busy = [a, b].filter((r) => r === "busy");
    expect(held).toHaveLength(1);
    expect(busy).toHaveLength(1);
    const holder = a === "held" ? "instance-a" : "instance-b";
    const doc = await FxRateSnapshotModel.findOne({ key: "USD" }).lean();
    expect(doc?.refreshingBy).toBe(holder);
    await releaseFxRefreshLock(holder);
  });

  it("a released lock can be claimed again", async () => {
    expect(await claimFxRefreshLock("one")).toBe("held");
    await releaseFxRefreshLock("one");
    expect(await claimFxRefreshLock("two")).toBe("held");
    await releaseFxRefreshLock("two");
    // The lock-only document (no rates — upserted by the claim) is
    // deleted on release, so nothing is left behind.
    const doc = await FxRateSnapshotModel.findOne({ key: "USD" }).lean();
    expect(doc).toBeNull();
  });

  it("a lock older than 60s can be re-claimed (crashed holder)", async () => {
    expect(await claimFxRefreshLock("crashed")).toBe("held");
    await FxRateSnapshotModel.updateOne(
      { key: "USD" },
      { $set: { refreshingAt: new Date(Date.now() - 120_000) } },
    );
    expect(await claimFxRefreshLock("rescuer")).toBe("held");
    await releaseFxRefreshLock("rescuer");
  });

  it("waitForFreshSnapshot resolves when another instance saves", async () => {
    await clearFxRateSnapshot();
    const waiting = waitForFreshSnapshot();
    await new Promise((r) => setTimeout(r, 300));
    await new FxRateSnapshotModel({
      key: "USD",
      base: "USD",
      rates: { USD: 1, EUR: 0.9, PKR: 270 },
      fetchedAt: new Date(),
      source: "currencyapi.net",
    }).save();
    const usd = await waiting;
    expect(usd?.rates.EUR).toBe(0.9);
    expect(usd?.rates.PKR).toBe(270);
  });
});
