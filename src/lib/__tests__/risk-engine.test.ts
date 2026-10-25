/**
 * Risk engine tests — explainable fake/unusual-order scoring.
 * Pure functions: every expectation below is hand-computed from the
 * documented point values in src/lib/risk-engine.ts.
 */
import { describe, it, expect } from "vitest";
import {
  scoreOrder,
  detectStoreAnomalies,
  applyMerchantFeedback,
  feedbackWeight,
  moneySaved,
  preventedFakeValue,
  rtoLoss,
  DISPOSABLE_EMAIL_DOMAINS,
  type ScoreOrderInput,
} from "@/lib/risk-engine";

const cleanOrder: ScoreOrderInput = {
  customerName: "Ahmed Khan",
  phone: "+923001234567",
  phoneCountry: "PK",
  email: "ahmed@example.com",
  shippingAddress: { street: "12 Main Street", city: "Lahore", postalCode: "54000" },
  billingAddress: { street: "12 Main Street", city: "Lahore", postalCode: "54000" },
  velocity: { phoneOrders: 1, emailOrders: 1 },
  pastHistory: { rtoCount: 0, refusedCount: 0, cancelledCount: 0 },
  orderValue: 100,
  quantity: 1,
  storeAverageOrderValue: 90,
  storeAverageQuantity: 1,
  isFirstTimeCustomer: false,
  paymentMethod: "prepaid",
  orderedAtHour: 14,
  isProxyOrVpn: false,
  productHistory: [{ productId: "p1", rtoRate: 0.05, sampleSize: 50 }],
  cityHistory: { city: "Lahore", rtoRate: 0.05, sampleSize: 50 },
  minSample: 10,
};

function codes(result: ReturnType<typeof scoreOrder>): string[] {
  return result.reasons.map((r) => r.code);
}

describe("scoreOrder — clean and banding", () => {
  it("clean order scores low with no reasons and no hold", () => {
    const r = scoreOrder(cleanOrder);
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
    expect(r.autoTag).toBe("risk-low");
    expect(r.holdFulfillment).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("band thresholds: medium at 30, high at 55, critical at 75", () => {
    // 15 (disposable) + 12 (gibberish name) + 6 (odd hours) = 33 → medium
    const medium = scoreOrder({
      ...cleanOrder,
      email: "x@mailinator.com",
      customerName: "Asdfghjkl",
      orderedAtHour: 3,
    });
    expect(medium.score).toBe(33);
    expect(medium.band).toBe("medium");
    expect(medium.holdFulfillment).toBe(false);
    expect(medium.autoTag).toBe("risk-medium");
  });

  it("disposable email + gibberish + velocity + RTO history pushes to critical", () => {
    const r = scoreOrder({
      ...cleanOrder,
      email: "buyer@mailinator.com",
      customerName: "Xyzqtrplk",
      shippingAddress: { street: "Qzxwvkj", city: "Lahore", postalCode: "54000" },
      velocity: { phoneOrders: 6, emailOrders: 6, windowDays: 7 },
      pastHistory: { rtoCount: 2, refusedCount: 1, cancelledCount: 0 },
    });
    expect(r.band).toBe("critical");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.holdFulfillment).toBe(true);
    expect(r.autoTag).toBe("risk-critical");
    const c = codes(r);
    expect(c).toContain("email-disposable");
    expect(c).toContain("name-gibberish");
    expect(c).toContain("velocity-high");
    expect(c).toContain("past-rto-history");
    // Every point contribution is explained: reasons sum to at least the score.
    const sum = r.reasons.reduce((s, x) => s + x.points, 0);
    expect(sum).toBeGreaterThanOrEqual(r.score);
    expect(r.reasons.every((x) => x.points > 0 && x.detail.length > 0)).toBe(true);
  });

  it("high band holds fulfilment", () => {
    // 15 disposable + 20 velocity + 20 RTO history = 55 → high
    const r = scoreOrder({
      ...cleanOrder,
      email: "buyer@yopmail.com",
      velocity: { phoneOrders: 5, windowDays: 7 },
      pastHistory: { rtoCount: 3, refusedCount: 0, cancelledCount: 0 },
    });
    expect(r.score).toBe(55);
    expect(r.band).toBe("high");
    expect(r.holdFulfillment).toBe(true);
    expect(r.autoTag).toBe("risk-high");
  });
});

describe("scoreOrder — individual signals", () => {
  it("flags invalid phone and country-format mismatch separately", () => {
    const invalid = scoreOrder({ ...cleanOrder, phone: "abc" });
    expect(codes(invalid)).toContain("phone-invalid");
    const mismatch = scoreOrder({ ...cleanOrder, phone: "+14155550123", phoneCountry: "PK" });
    expect(codes(mismatch)).toContain("phone-country-mismatch");
    expect(codes(mismatch)).not.toContain("phone-invalid");
    // Unknown country: no format check, no false positive.
    const unknown = scoreOrder({ ...cleanOrder, phone: "+33123456789", phoneCountry: "FR" });
    expect(codes(unknown)).not.toContain("phone-country-mismatch");
  });

  it("flags invalid email and disposable domains", () => {
    expect(codes(scoreOrder({ ...cleanOrder, email: "not-an-email" }))).toContain("email-invalid");
    expect(codes(scoreOrder({ ...cleanOrder, email: "a@guerrillamail.com" }))).toContain("email-disposable");
    expect(DISPOSABLE_EMAIL_DOMAINS.length).toBeGreaterThanOrEqual(30);
  });

  it("flags incomplete address and city/postal mismatch", () => {
    const incomplete = scoreOrder({ ...cleanOrder, shippingAddress: { city: "Lahore" } });
    expect(codes(incomplete)).toContain("address-incomplete");
    const mismatch = scoreOrder({ ...cleanOrder, addressCityPostalMismatch: true });
    expect(codes(mismatch)).toContain("address-city-postal-mismatch");
  });

  it("flags first-time large COD order", () => {
    const r = scoreOrder({
      ...cleanOrder,
      isFirstTimeCustomer: true,
      paymentMethod: "cod",
      orderValue: 300,
      storeAverageOrderValue: 100,
    });
    expect(codes(r)).toContain("first-time-large-cod");
    // Same value but prepaid: no COD signal (value-outlier may still fire).
    const prepaid = scoreOrder({
      ...cleanOrder,
      isFirstTimeCustomer: true,
      paymentMethod: "prepaid",
      orderValue: 300,
      storeAverageOrderValue: 100,
    });
    expect(codes(prepaid)).not.toContain("first-time-large-cod");
  });

  it("flags billing vs shipping mismatch, computed from addresses", () => {
    const r = scoreOrder({
      ...cleanOrder,
      billingAddress: { street: "99 Other Road", city: "Karachi", postalCode: "75000" },
    });
    expect(codes(r)).toContain("billing-shipping-mismatch");
  });

  it("flags odd hours, including a wrap-around night window", () => {
    expect(codes(scoreOrder({ ...cleanOrder, orderedAtHour: 3 }))).toContain("odd-hours");
    expect(codes(scoreOrder({ ...cleanOrder, orderedAtHour: 14 }))).not.toContain("odd-hours");
    const wrap = scoreOrder({
      ...cleanOrder,
      orderedAtHour: 23,
      nightWindow: { start: 22, end: 5 },
    });
    expect(codes(wrap)).toContain("odd-hours");
    // ISO timestamp path: 03:00 UTC is inside the default night window.
    const iso = scoreOrder({ ...cleanOrder, orderedAtHour: undefined, orderedAt: "2026-10-25T03:30:00Z" });
    expect(codes(iso)).toContain("odd-hours");
  });

  it("flags proxy/VPN and learned high-risk product/city only with sample", () => {
    expect(codes(scoreOrder({ ...cleanOrder, isProxyOrVpn: true }))).toContain("proxy-vpn");
    const learned = scoreOrder({
      ...cleanOrder,
      productHistory: [{ productId: "p9", rtoRate: 0.45, sampleSize: 40 }],
      cityHistory: { city: "Lahore", rtoRate: 0.4, sampleSize: 40 },
    });
    expect(codes(learned)).toContain("high-risk-product");
    expect(codes(learned)).toContain("high-risk-city");
    // Tiny sample must not mislead: same rates, 2 past orders → no signal.
    const tiny = scoreOrder({
      ...cleanOrder,
      productHistory: [{ productId: "p9", rtoRate: 0.9, sampleSize: 2 }],
      cityHistory: { city: "Lahore", rtoRate: 0.9, sampleSize: 2 },
    });
    expect(codes(tiny)).not.toContain("high-risk-product");
    expect(codes(tiny)).not.toContain("high-risk-city");
  });

  it("zero store average never produces NaN and adds no outlier signal", () => {
    const r = scoreOrder({
      ...cleanOrder,
      orderValue: 500,
      quantity: 10,
      storeAverageOrderValue: 0,
      storeAverageQuantity: 0,
    });
    expect(Number.isNaN(r.score)).toBe(false);
    expect(codes(r)).not.toContain("value-outlier");
    expect(codes(r)).not.toContain("quantity-outlier");
  });

  it("score never exceeds 100 no matter how many signals fire", () => {
    const r = scoreOrder({
      ...cleanOrder,
      phone: "bad",
      email: "a@mailinator.com",
      customerName: "Xyzqtrplk",
      shippingAddress: { street: "Qzxwvkj" },
      addressCityPostalMismatch: true,
      velocity: { phoneOrders: 99, emailOrders: 99, ipOrders: 99, deviceOrders: 99 },
      pastHistory: { rtoCount: 9, refusedCount: 9, cancelledCount: 9 },
      orderValue: 10000,
      quantity: 100,
      storeAverageOrderValue: 10,
      storeAverageQuantity: 1,
      isFirstTimeCustomer: true,
      paymentMethod: "cod",
      orderedAtHour: 2,
      isProxyOrVpn: true,
      productHistory: [{ productId: "p9", rtoRate: 0.9, sampleSize: 100 }],
      cityHistory: { city: "Lahore", rtoRate: 0.9, sampleSize: 100 },
      billingAddress: { street: "Elsewhere", city: "Karachi", postalCode: "75000" },
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("critical");
  });
});

describe("detectStoreAnomalies", () => {
  const flat = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    orders: 100,
    refunds: 2,
    revenue: 10000,
  }));

  it("finds an order spike and a refund spike", () => {
    const daily = [...flat];
    daily[9] = { ...daily[9], orders: 500 };
    const withRefundSpike = daily.map((d, i) =>
      i === 8 ? { ...d, refunds: 40 } : d,
    );
    const anomalies = detectStoreAnomalies({ daily: withRefundSpike });
    expect(anomalies.some((a) => a.type === "order-spike" && a.date === daily[9].date)).toBe(true);
    expect(anomalies.some((a) => a.type === "refund-spike" && a.date === daily[8].date)).toBe(true);
  });

  it("returns none on flat data", () => {
    expect(detectStoreAnomalies({ daily: flat })).toEqual([]);
  });

  it("returns none when history is shorter than 7 days", () => {
    const short = [...flat.slice(0, 3)];
    short[2] = { ...short[2], orders: 9999, refunds: 999 };
    expect(detectStoreAnomalies({ daily: short })).toEqual([]);
  });

  it("flags discount-code abuse and single-product dominance", () => {
    const anomalies = detectStoreAnomalies({
      daily: flat,
      discountCodes: [
        { code: "FREE100", count: 90 },
        { code: "SAVE10", count: 10 },
      ],
      productOrders: [
        { productId: "p-dominant", orders: 80 },
        { productId: "p-other", orders: 20 },
      ],
    });
    expect(anomalies.some((a) => a.type === "discount-code-abuse" && a.code === "FREE100")).toBe(true);
    expect(anomalies.some((a) => a.type === "product-dominance" && a.productId === "p-dominant")).toBe(true);
    // Balanced codes/products: no share-based anomaly.
    const balanced = detectStoreAnomalies({
      daily: flat,
      discountCodes: [
        { code: "A", count: 30 },
        { code: "B", count: 30 },
        { code: "C", count: 40 },
      ],
      productOrders: [
        { productId: "p1", orders: 40 },
        { productId: "p2", orders: 40 },
      ],
    });
    expect(balanced).toEqual([]);
  });
});

describe("merchant feedback calibration", () => {
  it("fake verdict on a low score raises weights", () => {
    const r = applyMerchantFeedback({
      score: 20,
      verdict: "fake",
      signalCodes: ["email-disposable", "velocity-high"],
    });
    expect(r.direction).toBe("increase");
    expect(r.adjustedWeights["email-disposable"]).toBe(1.25);
    expect(r.adjustedWeights["velocity-high"]).toBe(1.25);
    expect(r.note).toContain("fake");
  });

  it("genuine verdict on a high score lowers weights", () => {
    const r = applyMerchantFeedback({
      score: 80,
      verdict: "genuine",
      signalCodes: ["velocity-high"],
      currentWeights: { "velocity-high": 1.25 },
    });
    expect(r.direction).toBe("decrease");
    expect(r.adjustedWeights["velocity-high"]).toBe(1);
  });

  it("consistent verdicts leave weights unchanged", () => {
    const r = applyMerchantFeedback({ score: 80, verdict: "fake", signalCodes: ["x"] });
    expect(r.direction).toBe("none");
    expect(r.adjustedWeights["x"]).toBe(1);
  });

  it("feedbackWeight stays bounded in [0.5, 2.0]", () => {
    expect(feedbackWeight(2.0, "fake", 10)).toBe(2.0);
    expect(feedbackWeight(0.5, "genuine", 90)).toBe(0.5);
    expect(feedbackWeight(1.9, "fake", 10)).toBeLessThanOrEqual(2.0);
    expect(feedbackWeight(0.6, "genuine", 90)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("moneySaved", () => {
  it("RTO loss is shipping + packaging, rounded to 2dp", () => {
    expect(rtoLoss(12.345, 2.1)).toBe(14.45);
    expect(moneySaved(500, 12.345, 2.1, true)).toBe(14.45);
  });

  it("prevented fake value is the full order value", () => {
    expect(preventedFakeValue(499.99)).toBe(499.99);
    expect(moneySaved(499.99, 12, 2, false)).toBe(499.99);
  });

  it("non-finite money inputs coerce to 0, never NaN", () => {
    expect(moneySaved(Number.NaN, Number.NaN, Number.NaN, true)).toBe(0);
    expect(moneySaved(Number.NaN, 0, 0, false)).toBe(0);
  });
});
