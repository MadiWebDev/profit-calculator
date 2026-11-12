/**
 * Money-currency helpers — the "no money without an explicit currency"
 * rule (order-currency fix, Phases 1 + 2, unified).
 *
 * Phase 1 suites (pure logic): the derivation precedence, the code
 * validation, and the form default for manually entered orders.
 * Phase 2 suites (pure + DB-backed): the server never stamps a manual
 * money row USD by default — it derives user displayCurrency > team
 * currency > store currency, and returns null (caller rejects the
 * write) when no source yields a valid code.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import {
  normalizeCurrencyCode,
  resolveOrderCurrency,
  defaultFormCurrency,
  resolveMoneyCurrency,
  normalizeMoneyCurrency,
} from "@/lib/money-currency";
// Server-only derivation (mongoose models) — a separate module so the
// pure helpers above stay importable from client components.
import { deriveMoneyCurrency } from "@/lib/money-currency-server";
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";

describe("normalizeCurrencyCode", () => {
  it("accepts 3-letter codes and normalizes case/whitespace", () => {
    expect(normalizeCurrencyCode("PKR")).toBe("PKR");
    expect(normalizeCurrencyCode("usd")).toBe("USD");
    expect(normalizeCurrencyCode("  eur ")).toBe("EUR");
  });

  it("rejects anything that is not a 3-letter code", () => {
    expect(normalizeCurrencyCode("US")).toBeNull();
    expect(normalizeCurrencyCode("USDD")).toBeNull();
    expect(normalizeCurrencyCode("U5D")).toBeNull();
    expect(normalizeCurrencyCode("")).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
    expect(normalizeCurrencyCode(undefined)).toBeNull();
    expect(normalizeCurrencyCode(123)).toBeNull();
    expect(normalizeCurrencyCode({})).toBeNull();
  });
});

describe("resolveOrderCurrency", () => {
  it("prefers the currency the client sent", () => {
    expect(
      resolveOrderCurrency({ sent: "EUR", user: "PKR", team: "USD", store: "GBP" }),
    ).toBe("EUR");
    // Lowercase sent values are normalized, not rejected.
    expect(resolveOrderCurrency({ sent: "pkr", user: "USD" })).toBe("PKR");
  });

  it("derives user display > team > store when nothing is sent", () => {
    expect(resolveOrderCurrency({ user: "PKR", team: "USD", store: "GBP" })).toBe("PKR");
    expect(resolveOrderCurrency({ user: null, team: "EUR", store: "GBP" })).toBe("EUR");
    expect(resolveOrderCurrency({ team: undefined, store: "GBP" })).toBe("GBP");
    // An invalid value at one level falls through to the next.
    expect(resolveOrderCurrency({ user: "bogus", team: "EUR" })).toBe("EUR");
    expect(resolveOrderCurrency({ sent: "12", user: "PKR" })).toBe("PKR");
  });

  it("never invents USD: null when no source is usable", () => {
    expect(resolveOrderCurrency({})).toBeNull();
    expect(resolveOrderCurrency({ sent: undefined, user: null, team: "", store: "USDD" })).toBeNull();
  });
});

describe("defaultFormCurrency", () => {
  it("uses the stored order currency when editing", () => {
    expect(defaultFormCurrency("USD", "PKR")).toBe("USD");
    expect(defaultFormCurrency("eur", "PKR")).toBe("EUR");
  });

  it("falls back to the display currency for a new order", () => {
    expect(defaultFormCurrency("", "PKR")).toBe("PKR");
    expect(defaultFormCurrency(null, "PKR")).toBe("PKR");
    expect(defaultFormCurrency(undefined, "EUR")).toBe("EUR");
  });

  it("returns null when neither source is usable", () => {
    expect(defaultFormCurrency("", "")).toBeNull();
    expect(defaultFormCurrency(null, undefined)).toBeNull();
    expect(defaultFormCurrency("bogus", "12")).toBeNull();
  });
});

describe("resolveMoneyCurrency (pure precedence)", () => {
  it("user display currency wins over team and store", () => {
    expect(resolveMoneyCurrency({ user: "PKR", team: "EUR", store: "GBP" })).toBe("PKR");
  });

  it("team currency wins when the user has none", () => {
    expect(resolveMoneyCurrency({ user: null, team: "EUR", store: "GBP" })).toBe("EUR");
    expect(resolveMoneyCurrency({ team: "EUR", store: "GBP" })).toBe("EUR");
  });

  it("store currency is the last resort", () => {
    expect(resolveMoneyCurrency({ user: null, team: null, store: "GBP" })).toBe("GBP");
    expect(resolveMoneyCurrency({ store: "GBP" })).toBe("GBP");
  });

  it("lowercase codes are normalized to upper case", () => {
    expect(resolveMoneyCurrency({ user: "pkr" })).toBe("PKR");
    expect(resolveMoneyCurrency({ user: null, team: " eur " })).toBe("EUR");
  });

  it("invalid codes are skipped, not used", () => {
    // A 2-letter team code and an empty user code fall through to the store.
    expect(resolveMoneyCurrency({ user: "", team: "XX", store: "GBP" })).toBe("GBP");
    expect(resolveMoneyCurrency({ user: "USDD", team: "EU R", store: "JPY" })).toBe("JPY");
  });

  it("returns null — never USD — when no source is valid", () => {
    expect(resolveMoneyCurrency({})).toBeNull();
    expect(resolveMoneyCurrency({ user: null, team: undefined, store: "" })).toBeNull();
    expect(resolveMoneyCurrency({ user: "US", team: "USDD" })).toBeNull();
  });

  it("a valid team currency is returned even when it is USD (the team's own setting)", () => {
    // Team.currency defaults to USD at team creation: deriving it is
    // the team's configured currency, not a silent per-write default.
    expect(resolveMoneyCurrency({ user: null, team: "USD", store: "PKR" })).toBe("USD");
  });
});

describe("normalizeMoneyCurrency", () => {
  it("upper-cases valid codes and rejects the rest", () => {
    expect(normalizeMoneyCurrency("pkr")).toBe("PKR");
    expect(normalizeMoneyCurrency("EUR")).toBe("EUR");
    expect(normalizeMoneyCurrency("US")).toBeNull();
    expect(normalizeMoneyCurrency("USDD")).toBeNull();
    expect(normalizeMoneyCurrency("")).toBeNull();
    expect(normalizeMoneyCurrency(null)).toBeNull();
    expect(normalizeMoneyCurrency(42)).toBeNull();
  });
});

describe("deriveMoneyCurrency (DB-backed)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 60000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await clearDb();
  });

  function rand() {
    return Math.random().toString(36).slice(2, 10);
  }

  async function makeUser(displayCurrency?: string | null) {
    return UserModel.create({
      name: "Test User",
      email: `money-currency-${rand()}@example.com`,
      displayCurrency: displayCurrency ?? undefined,
    });
  }

  async function makeTeam(currency?: string) {
    const ownerId = new mongoose.Types.ObjectId();
    return TeamModel.create({
      name: "Test Team",
      slug: `money-currency-${rand()}`,
      ownerId,
      plan: "free",
      ...(currency === undefined ? {} : { currency }),
    });
  }

  async function makeStore(teamId: mongoose.Types.ObjectId, currency?: string) {
    return StoreModel.create({
      teamId,
      name: `Store ${currency ?? "none"}`,
      platform: "shopify",
      ...(currency === undefined ? {} : { currency }),
    });
  }

  it("a store created without a currency has none — never silently USD", async () => {
    const team = await makeTeam("PKR");
    const store = await makeStore(team._id);
    expect(store.currency).toBeUndefined();
  });

  it("a currency-less store does not vote USD in the store step", async () => {
    const user = await makeUser(null);
    // "XX" is stored as-is (no shape validator on Team.currency) and
    // fails the 3-letter check, so the store step decides.
    const team = await makeTeam("XX");
    // A store created without a currency (the old model default was
    // silently "USD") must not contribute a USD vote.
    await makeStore(team._id);
    await makeStore(team._id, "GBP");
    await expect(
      deriveMoneyCurrency({ userId: user._id.toString(), teamId: team._id.toString() })
    ).resolves.toBe("GBP");
  });

  it("prefers the user's display currency over team and store", async () => {
    const user = await makeUser("PKR");
    const team = await makeTeam("EUR");
    await makeStore(team._id, "GBP");
    await expect(
      deriveMoneyCurrency({ userId: user._id.toString(), teamId: team._id.toString() })
    ).resolves.toBe("PKR");
  });

  it("falls back to the team currency when the user has none saved", async () => {
    const user = await makeUser(null);
    const team = await makeTeam("EUR");
    await makeStore(team._id, "GBP");
    await expect(
      deriveMoneyCurrency({ userId: user._id.toString(), teamId: team._id.toString() })
    ).resolves.toBe("EUR");
  });

  it("falls back to the most common store currency when user and team have none valid", async () => {
    const user = await makeUser(null);
    // "XX" is stored as-is (no shape validator on Team.currency) and
    // fails the 3-letter check, so the store step decides.
    const team = await makeTeam("XX");
    await makeStore(team._id, "PKR");
    await makeStore(team._id, "PKR");
    await makeStore(team._id, "GBP");
    await expect(
      deriveMoneyCurrency({ userId: user._id.toString(), teamId: team._id.toString() })
    ).resolves.toBe("PKR");
  });

  it("uses the selected store's own currency when a storeId is given", async () => {
    const team = await makeTeam("XX");
    const pkrStore = await makeStore(team._id, "PKR");
    await makeStore(team._id, "GBP");
    await makeStore(team._id, "GBP");
    // Most-common would be GBP, but the selected store is PKR.
    await expect(
      deriveMoneyCurrency({ teamId: team._id.toString(), storeId: pkrStore._id.toString() })
    ).resolves.toBe("PKR");
  });

  it("works for API-key callers (no userId): team, then store", async () => {
    const team = await makeTeam("EUR");
    await makeStore(team._id, "GBP");
    await expect(deriveMoneyCurrency({ teamId: team._id.toString() })).resolves.toBe("EUR");
  });

  it("returns the team's own USD when that is what the team configured (no silent default)", async () => {
    // A team created without a currency gets the model default "USD" —
    // deriving it is the team's setting, and the write is explicit.
    const team = await makeTeam();
    await expect(deriveMoneyCurrency({ teamId: team._id.toString() })).resolves.toBe("USD");
  });

  it("returns null when nothing is derivable (caller must reject the write)", async () => {
    const team = await makeTeam("XX");
    await expect(deriveMoneyCurrency({ teamId: team._id.toString() })).resolves.toBeNull();
  });

  it("never throws for unknown ids — an unreadable source is just absent", async () => {
    const team = await makeTeam("EUR");
    await expect(
      deriveMoneyCurrency({
        userId: new mongoose.Types.ObjectId().toString(),
        teamId: team._id.toString(),
      })
    ).resolves.toBe("EUR");
    await expect(
      deriveMoneyCurrency({ userId: "not-an-objectid", teamId: team._id.toString() })
    ).resolves.toBe("EUR");
  });
});
