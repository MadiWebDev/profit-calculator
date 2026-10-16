/**
 * Reporting currency normalization tests — Phase 12.
 * Mixed-currency orders must be converted to the team's base currency
 * before aggregation, never summed 1:1.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import TeamModel from "@/models/Team";
import mongoose from "mongoose";
import { normalizeReportOrders, getTeamBaseCurrency } from "@/lib/reporting";
import * as fx from "@/lib/fx";

beforeAll(async () => {
  await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await clearDb();
  vi.restoreAllMocks();
});

const order = (currency: string, grossRevenue: number) => ({
  currency,
  grossRevenue,
  discounts: 0,
  shippingRevenue: 0,
  shippingCost: 0,
  totalCogs: 0,
  transactionFees: 0,
  taxes: 0,
  refundAmount: 0,
  chargebackAmount: 0,
  adSpendAllocated: 0,
});

async function makeTeam(currency: string): Promise<string> {
  const team = await TeamModel.create({
    name: "T",
    slug: `t-${currency.toLowerCase()}-${Date.now()}`,
    ownerId: new mongoose.Types.ObjectId(),
    currency,
    plan: "free",
  });
  return team._id.toString();
}

describe("normalizeReportOrders", () => {
  it("fast path: single-currency orders need no FX fetch", async () => {
    const teamId = await makeTeam("USD");
    const spy = vi.spyOn(fx, "getFxRates");
    const report = await normalizeReportOrders(
      [order("USD", 100), order("USD", 50)],
      teamId
    );
    expect(spy).not.toHaveBeenCalled();
    expect(report.summary.totalRevenue).toBe(150);
    expect(report.baseCurrency).toBe("USD");
    expect(report.unconverted).toBe(0);
  });

  it("converts mixed currencies into the team base currency", async () => {
    const teamId = await makeTeam("USD");
    // EUR 0.92 per USD → €92 = $100
    vi.spyOn(fx, "getFxRates").mockResolvedValue({
      base: "USD",
      rates: { USD: 1, EUR: 0.92 },
      fetchedAt: new Date().toISOString(),
    });
    const report = await normalizeReportOrders(
      [order("USD", 100), order("EUR", 92)],
      teamId
    );
    expect(report.summary.totalRevenue).toBe(200);
    expect(report.unconverted).toBe(0);
  });

  it("degrades gracefully when FX is unavailable", async () => {
    const teamId = await makeTeam("USD");
    vi.spyOn(fx, "getFxRates").mockRejectedValue(new Error("network down"));
    const report = await normalizeReportOrders(
      [order("USD", 100), order("EUR", 92)],
      teamId
    );
    // Old behavior preserved, flagged via unconverted count
    expect(report.summary.totalRevenue).toBe(192);
    expect(report.unconverted).toBe(2);
  });

  it("leaves unknown-currency orders unconverted and counts them", async () => {
    const teamId = await makeTeam("USD");
    vi.spyOn(fx, "getFxRates").mockResolvedValue({
      base: "USD",
      rates: { USD: 1 },
      fetchedAt: new Date().toISOString(),
    });
    const report = await normalizeReportOrders(
      [order("USD", 100), order("XXX", 50)],
      teamId
    );
    expect(report.summary.totalRevenue).toBe(150);
    expect(report.unconverted).toBe(1);
  });

  it("getTeamBaseCurrency falls back to USD", async () => {
    const teamId = await makeTeam("USD");
    expect(await getTeamBaseCurrency(teamId)).toBe("USD");
    expect(await getTeamBaseCurrency("000000000000000000000000")).toBe("USD");
  });
});
