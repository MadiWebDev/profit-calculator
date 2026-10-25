/**
 * Courier performance module tests — Phase 6 (pure functions).
 * Covers status mapping, CSV parsing, metrics, city normalisation,
 * ranking + min-sample gating, switching profit, and alert detection.
 */
import { describe, it, expect } from "vitest";
import {
  GenericTrackingAdapter,
  genericTrackingAdapter,
  normalizeShipmentStatus,
  parseShipmentCsv,
  courierMetrics,
  cityMetrics,
  rankCouriersForDestination,
  switchingProfitImpact,
  stuckShipments,
  settlementDelays,
  type ShipmentInput,
  type ShipmentStatus,
} from "@/lib/courier";

const d = (iso: string) => new Date(iso);

function shipment(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    courier: "TCS",
    city: "Karachi",
    region: "Sindh",
    postalCode: "75000",
    status: "delivered",
    cost: 200,
    codAmount: 0,
    codCollected: false,
    bookedAt: d("2026-10-01T00:00:00Z"),
    deliveredAt: d("2026-10-03T00:00:00Z"),
    attempts: 1,
    createdAt: d("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

/** n delivered shipments for a courier in a city, with given cost/RTO mix. */
function batch(
  courier: string,
  city: string,
  count: number,
  opts: { cost?: number; rto?: number; days?: number } = {},
): ShipmentInput[] {
  const out: ShipmentInput[] = [];
  const rtoCount = opts.rto ?? 0;
  for (let i = 0; i < count; i += 1) {
    const isRto = i < rtoCount;
    const days = opts.days ?? 2;
    out.push(
      shipment({
        courier,
        city,
        status: (isRto ? "returned_rto" : "delivered") as ShipmentStatus,
        cost: opts.cost ?? 200,
        bookedAt: d("2026-10-01T00:00:00Z"),
        deliveredAt: isRto ? undefined : d(`2026-10-0${1 + days}T00:00:00Z`),
      }),
    );
  }
  return out;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

describe("normalizeShipmentStatus / GenericTrackingAdapter", () => {
  it.each([
    ["booked", "booked"],
    ["Booked", "booked"],
    ["label created", "booked"],
    ["Picked Up", "picked_up"],
    ["picked-up", "picked_up"],
    ["IN TRANSIT", "in_transit"],
    ["in-transit", "in_transit"],
    ["shipped", "in_transit"],
    ["Out for Delivery", "out_for_delivery"],
    ["Out-For_Delivery", "out_for_delivery"],
    ["Delivered", "delivered"],
    ["delivery completed", "delivered"],
    ["Delivery Failed", "failed_attempt"],
    ["failed attempt", "failed_attempt"],
    ["Returned", "returned_rto"],
    ["returned to origin", "returned_rto"],
    ["RTO", "returned_rto"],
    ["Cancelled", "cancelled"],
    ["canceled", "cancelled"],
  ] as const)("maps %p -> %p", (raw, expected) => {
    expect(normalizeShipmentStatus(raw)).toBe(expected);
    expect(new GenericTrackingAdapter().normalizeStatus(raw)).toBe(expected);
    expect(genericTrackingAdapter.normalizeStatus(raw)).toBe(expected);
  });

  it("returns null for unknown, empty, and whitespace-only input", () => {
    expect(normalizeShipmentStatus("teleported")).toBeNull();
    expect(normalizeShipmentStatus("")).toBeNull();
    expect(normalizeShipmentStatus("   ")).toBeNull();
    expect(genericTrackingAdapter.normalizeStatus("???")).toBeNull();
  });

  it("does not confuse 'delivery failed' with 'delivered'", () => {
    expect(normalizeShipmentStatus("delivery failed")).toBe("failed_attempt");
    expect(normalizeShipmentStatus("delivery failed attempt")).toBe(
      "failed_attempt",
    );
  });

  it("adapter exposes name and tracking support", () => {
    expect(genericTrackingAdapter.name).toBe("generic");
    expect(genericTrackingAdapter.supportsTracking).toBe(true);
  });
});

// ─── CSV parsing ──────────────────────────────────────────────────────────────

describe("parseShipmentCsv", () => {
  const header =
    "tracking_number,courier,city,region,postal_code,status,cost,cod_amount,cod_collected,booked_at,delivered_at,attempts";

  it("parses a well-formed CSV with quoted commas", () => {
    const csv = [
      header,
      'TRK1,TCS,"Karachi, South",Sindh,75000,delivered,200,1500,true,2026-10-01,2026-10-03,1',
      "TRK2,Leopards,Lahore,Punjab,54000,in_transit,180,0,false,2026-10-02,,1",
    ].join("\n");
    const { shipments, errors } = parseShipmentCsv(csv);
    expect(errors).toEqual([]);
    expect(shipments).toHaveLength(2);
    expect(shipments[0].city).toBe("Karachi, South");
    expect(shipments[0].status).toBe("delivered");
    expect(shipments[0].cost).toBe(200);
    expect(shipments[0].codCollected).toBe(true);
    expect(shipments[0].trackingNumber).toBe("TRK1");
    expect(shipments[1].deliveredAt).toBeUndefined();
    expect(shipments[1].status).toBe("in_transit");
  });

  it("collects bad rows as errors instead of throwing", () => {
    const csv = [
      header,
      "TRK1,TCS,Karachi,Sindh,75000,delivered,200,0,false,2026-10-01,2026-10-03,1",
      "TRK2,TCS,Karachi,Sindh,75000,teleported,200,0,false,2026-10-01,,1",
      "TRK3,TCS,Karachi,Sindh,75000,delivered,not-a-number,0,false,2026-10-01,2026-10-03,1",
      "TRK4,,Karachi,Sindh,75000,delivered,200,0,false,2026-10-01,2026-10-03,1",
      "TRK5,TCS,Karachi,Sindh,75000,delivered,200,0,false,2026-10-01,2026-10-04,2",
    ].join("\n");
    const { shipments, errors } = parseShipmentCsv(csv);
    expect(shipments).toHaveLength(2);
    expect(shipments.map((s) => s.trackingNumber)).toEqual(["TRK1", "TRK5"]);
    expect(errors).toHaveLength(3);
    expect(errors[0].line).toBe(3);
    expect(errors[0].reason).toMatch(/unknown status/);
    expect(errors[1].reason).toMatch(/invalid cost/);
    expect(errors[2].reason).toMatch(/missing courier/);
  });

  it("tolerates missing optional columns", () => {
    const csv = [
      "tracking_number,courier,city,status",
      "TRK1,TCS,Karachi,delivered",
      "TRK2,TCS,Lahore,returned",
    ].join("\n");
    const { shipments, errors } = parseShipmentCsv(csv);
    expect(errors).toEqual([]);
    expect(shipments).toHaveLength(2);
    expect(shipments[0].region).toBe("");
    expect(shipments[0].cost).toBe(0);
    expect(shipments[0].attempts).toBe(1);
    expect(shipments[1].status).toBe("returned_rto");
  });

  it("skips blank rows silently and handles CRLF", () => {
    const csv = [header, "", "TRK1,TCS,Karachi,Sindh,75000,delivered,200,0,false,2026-10-01,2026-10-03,1", ""].join(
      "\r\n",
    );
    const { shipments, errors } = parseShipmentCsv(csv);
    expect(errors).toEqual([]);
    expect(shipments).toHaveLength(1);
  });

  it("returns empty results for empty input", () => {
    expect(parseShipmentCsv("")).toEqual({ shipments: [], errors: [] });
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = [
      "tracking_number,courier,city,status",
      'TRK1,TCS,"Karachi ""South""",delivered',
    ].join("\n");
    const { shipments } = parseShipmentCsv(csv);
    expect(shipments[0].city).toBe('Karachi "South"');
  });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

describe("courierMetrics", () => {
  it("computes success, RTO, delivery days, first-attempt, cost, settlement, exceptions", () => {
    const list: ShipmentInput[] = [
      shipment({ cost: 200, attempts: 1 }), // delivered, 2 days
      shipment({
        cost: 300,
        attempts: 2,
        bookedAt: d("2026-10-01T00:00:00Z"),
        deliveredAt: d("2026-10-05T00:00:00Z"),
      }), // delivered, 4 days, 2nd attempt
      shipment({
        status: "returned_rto",
        cost: 250,
        deliveredAt: undefined,
        attempts: 1,
      }),
      shipment({
        status: "failed_attempt",
        cost: 250,
        deliveredAt: undefined,
        attempts: 1,
      }),
      shipment({
        status: "delivered",
        cost: 200,
        attempts: 1,
        codAmount: 1000,
        codCollected: true,
        codSettledAt: d("2026-10-06T00:00:00Z"),
        bookedAt: d("2026-10-01T00:00:00Z"),
        deliveredAt: d("2026-10-03T00:00:00Z"),
      }), // delivered COD, settled 3 days later
    ];
    const [m] = courierMetrics(list);
    expect(m.total).toBe(5);
    expect(m.delivered).toBe(3);
    expect(m.deliverySuccessRate).toBe(60);
    expect(m.rtoRate).toBe(20);
    expect(m.avgDeliveryDays).toBeCloseTo(2.67, 2); // (2 + 4 + 2) / 3
    expect(m.firstAttemptSuccessRate).toBeCloseTo(66.67, 2); // 2 of 3 delivered
    expect(m.costPerShipment).toBe(240);
    expect(m.avgCodSettlementDays).toBe(3);
    expect(m.exceptionRate).toBe(40); // 1 failed + 1 RTO of 5
  });

  it("returns all zeros (never NaN) for empty input and undelivered-only input", () => {
    expect(courierMetrics([])).toEqual([]);
    const [m] = courierMetrics([
      shipment({ status: "in_transit", deliveredAt: undefined }),
    ]);
    expect(m.deliverySuccessRate).toBe(0);
    expect(m.rtoRate).toBe(0);
    expect(m.avgDeliveryDays).toBe(0);
    expect(m.firstAttemptSuccessRate).toBe(0);
    expect(m.avgCodSettlementDays).toBe(0);
    expect(m.exceptionRate).toBe(0);
    expect(Number.isNaN(m.costPerShipment)).toBe(false);
  });

  it("groups by courier and sorts by courier name", () => {
    const list = [
      shipment({ courier: "Zebra" }),
      shipment({ courier: "Alpha" }),
      shipment({ courier: "Zebra", status: "returned_rto", deliveredAt: undefined }),
    ];
    const metrics = courierMetrics(list);
    expect(metrics.map((m) => m.courier)).toEqual(["Alpha", "Zebra"]);
    expect(metrics[1].total).toBe(2);
    expect(metrics[1].rtoRate).toBe(50);
  });
});

// ─── City / region metrics ────────────────────────────────────────────────────

describe("cityMetrics", () => {
  it("normalises city casing/whitespace into one group with a display name", () => {
    const list = [
      shipment({ city: "  KARACHI " }),
      shipment({ city: "Karachi" }),
      shipment({ city: "karachi", status: "returned_rto", deliveredAt: undefined }),
      shipment({ city: "Lahore" }),
    ];
    const { byCity, byRegion } = cityMetrics(list);
    const karachi = byCity.find((m) => m.cityKey === "karachi");
    expect(karachi).toBeDefined();
    expect(karachi!.total).toBe(3);
    expect(karachi!.city).toBe("Karachi");
    expect(karachi!.rtoRate).toBeCloseTo(33.33, 2);
    expect(byCity.find((m) => m.cityKey === "lahore")!.total).toBe(1);
    // Regions group independently of city casing.
    expect(byRegion.find((m) => m.regionKey === "sindh")!.total).toBe(4);
  });

  it("handles multi-word courier names without key collisions", () => {
    const list = [
      shipment({ courier: "TCS Courier", city: "Karachi" }),
      shipment({ courier: "TCS Courier", city: "Karachi" }),
      shipment({ courier: "TCS", city: "Courier Karachi" }),
    ];
    const { byCity } = cityMetrics(list);
    expect(byCity).toHaveLength(2);
    expect(
      byCity.find((m) => m.courier === "TCS Courier")!.total,
    ).toBe(2);
  });
});

// ─── Ranking ──────────────────────────────────────────────────────────────────

describe("rankCouriersForDestination", () => {
  it("prefers a high-success courier over a cheap but failing one", () => {
    const list = [
      // Reliable but pricey: 100% success, 250/shipment.
      ...batch("Reliable", "Karachi", 25, { cost: 250, days: 2 }),
      // Cheap but failing: 50% success (10 RTO of 20... use 25 with 12 RTO).
      ...batch("CheapFail", "Karachi", 25, { cost: 100, rto: 12, days: 2 }),
    ];
    const { ranked } = rankCouriersForDestination(list, "Karachi", "", {
      minSample: 20,
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].courier).toBe("Reliable");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("gates tiny samples into insufficientData, never ranked as confident", () => {
    const list = [
      ...batch("Big", "Karachi", 25, { cost: 200 }),
      ...batch("Tiny", "Karachi", 3, { cost: 50 }),
    ];
    const { ranked, insufficientData } = rankCouriersForDestination(
      list,
      "Karachi",
      "",
      { minSample: 20 },
    );
    expect(ranked.map((r) => r.courier)).toEqual(["Big"]);
    expect(insufficientData).toHaveLength(1);
    expect(insufficientData[0].courier).toBe("Tiny");
    expect(insufficientData[0].sample).toBe(3);
    expect(insufficientData[0].confidence).toBe("low");
  });

  it("uses the default minSample of 20 when opts are omitted", () => {
    const list = batch("Small", "Karachi", 19, { cost: 100 });
    const { ranked, insufficientData } = rankCouriersForDestination(
      list,
      "Karachi",
      "",
    );
    expect(ranked).toEqual([]);
    expect(insufficientData).toHaveLength(1);
  });

  it("assigns confidence by sample size and filters to the city", () => {
    const list = [
      ...batch("Huge", "Karachi", 120, { cost: 200 }),
      ...batch("Mid", "Karachi", 60, { cost: 200 }),
      ...batch("Elsewhere", "Lahore", 200, { cost: 10 }),
    ];
    const { ranked } = rankCouriersForDestination(list, "Karachi", "", {
      minSample: 20,
    });
    expect(ranked.map((r) => r.courier)).toEqual(["Huge", "Mid"]);
    expect(ranked.find((r) => r.courier === "Huge")!.confidence).toBe("high");
    expect(ranked.find((r) => r.courier === "Mid")!.confidence).toBe("medium");
  });

  it("falls back to region filtering when no city is given", () => {
    const list = [
      ...batch("SindhCo", "Karachi", 25, { cost: 200 }),
      ...batch("PunjabCo", "Lahore", 25, { cost: 200 }),
    ];
    // Both batches share default region "Sindh" via shipment(); override:
    const punjab = list.slice(25).map((s) => ({ ...s, region: "Punjab" }));
    const all = [...list.slice(0, 25), ...punjab];
    const { ranked } = rankCouriersForDestination(all, "", "Punjab", {
      minSample: 20,
    });
    expect(ranked.map((r) => r.courier)).toEqual(["PunjabCo"]);
  });
});

// ─── Switching profit ─────────────────────────────────────────────────────────

describe("switchingProfitImpact", () => {
  it("computes cost saving + RTO saving per shipment", () => {
    const list = [
      // Current mix: 20 shipments at 300, 5 RTO (25%).
      ...batch("Current", "Karachi", 20, { cost: 300, rto: 5 }),
      // Best: 25 shipments at 200, 0 RTO.
      ...batch("Best", "Karachi", 25, { cost: 200 }),
    ];
    const impact = switchingProfitImpact(list, "Karachi", 300, {
      minSample: 20,
    });
    expect(impact.eligible).toBe(true);
    expect(impact.bestCourier).toBe("Best");
    // Current mix cost = (20*300 + 25*200)/45 = 244.44; best = 200.
    expect(impact.currentCostPerShipment).toBeCloseTo(244.44, 2);
    expect(impact.bestCostPerShipment).toBe(200);
    // Current mix RTO = 5/45 = 11.11%; best = 0%.
    expect(impact.currentRtoRate).toBeCloseTo(11.11, 2);
    // Extra = 44.44 + 0.1111*300 = 44.44 + 33.33 = 77.77.
    expect(impact.extraProfitPerShipment).toBeCloseTo(77.77, 2);
    expect(impact.extraProfitPer100Shipments).toBeCloseTo(7777, 0);
  });

  it("returns 0 with eligible=false when no courier meets minSample", () => {
    const list = batch("Tiny", "Karachi", 5, { cost: 100 });
    const impact = switchingProfitImpact(list, "Karachi", 350, {
      minSample: 20,
    });
    expect(impact.eligible).toBe(false);
    expect(impact.bestCourier).toBeNull();
    expect(impact.extraProfitPerShipment).toBe(0);
  });
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

describe("stuckShipments and settlementDelays", () => {
  const now = d("2026-10-20T00:00:00Z");

  it("flags in-transit/out-for-delivery older than the threshold only", () => {
    const list = [
      shipment({
        status: "in_transit",
        bookedAt: d("2026-10-10T00:00:00Z"),
        deliveredAt: undefined,
      }), // 10 days old -> stuck
      shipment({
        status: "out_for_delivery",
        bookedAt: d("2026-10-14T00:00:00Z"),
        deliveredAt: undefined,
      }), // 6 days old -> stuck
      shipment({
        status: "in_transit",
        bookedAt: d("2026-10-18T00:00:00Z"),
        deliveredAt: undefined,
      }), // 2 days old -> not stuck
      shipment({
        status: "in_transit",
        bookedAt: d("2026-10-15T00:00:00Z"),
        deliveredAt: undefined,
      }), // exactly 5 days -> not stuck (strictly older)
      shipment({ status: "delivered" }), // delivered never stuck
    ];
    const stuck = stuckShipments(list, now, 5);
    expect(stuck).toHaveLength(2);
    expect(stuck.map((s) => s.status)).toEqual([
      "in_transit",
      "out_for_delivery",
    ]);
  });

  it("uses the default 5-day threshold", () => {
    const list = [
      shipment({
        status: "in_transit",
        bookedAt: d("2026-10-13T00:00:00Z"),
        deliveredAt: undefined,
      }),
    ];
    expect(stuckShipments(list, now)).toHaveLength(1);
  });

  it("flags delivered COD collected-but-unsettled beyond the delay only", () => {
    const list = [
      shipment({
        codAmount: 1000,
        codCollected: true,
        deliveredAt: d("2026-10-01T00:00:00Z"),
      }), // 19 days unsettled -> flagged
      shipment({
        codAmount: 1000,
        codCollected: true,
        deliveredAt: d("2026-10-15T00:00:00Z"),
      }), // 5 days -> not flagged
      shipment({
        codAmount: 1000,
        codCollected: true,
        deliveredAt: d("2026-10-01T00:00:00Z"),
        codSettledAt: d("2026-10-18T00:00:00Z"),
      }), // settled -> not flagged
      shipment({
        codAmount: 1000,
        codCollected: false,
        deliveredAt: d("2026-10-01T00:00:00Z"),
      }), // not COD -> not flagged
      shipment({
        status: "in_transit",
        codCollected: true,
        deliveredAt: undefined,
      }), // not delivered -> not flagged
    ];
    const delayed = settlementDelays(list, now, 7);
    expect(delayed).toHaveLength(1);
    expect(delayed[0].deliveredAt).toEqual(d("2026-10-01T00:00:00Z"));
  });

  it("uses the default 7-day settlement threshold", () => {
    const list = [
      shipment({
        codCollected: true,
        deliveredAt: d("2026-10-12T00:00:00Z"),
      }),
    ];
    expect(settlementDelays(list, now)).toHaveLength(1);
  });
});
