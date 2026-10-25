/**
 * Fake / unusual-order risk engine (Phase 4).
 *
 * Pure functions only: no DB, no network, no side effects. The caller
 * (webhook handler / review queue) supplies the order facts and the store's
 * learned history; this module only scores and explains.
 *
 * Scoring model: additive points, capped at 100. Every point contribution
 * appears in `reasons` as a RiskSignal, so a merchant can always see WHY
 * an order scored what it did. The raw sum of `reasons` may exceed 100
 * when the cap applies; `score` itself never exceeds 100.
 *
 * Bands: <30 low, 30-54 medium, 55-74 high, >=75 critical.
 * holdFulfillment is true for high and critical.
 *
 * Money helpers (moneySaved / rtoLoss / preventedFakeValue) use the
 * shared `round` / `toMoney` helpers from profit-engine, so all money
 * outputs are rounded to 2dp and non-finite inputs coerce to 0.
 */
import { round, toMoney } from "@/lib/profit-engine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiskSignal {
  code: string;
  label: string;
  points: number;
  detail: string;
}

export interface RiskScore {
  score: number; // 0-100, capped
  band: "low" | "medium" | "high" | "critical";
  reasons: RiskSignal[];
  autoTag: "risk-low" | "risk-medium" | "risk-high" | "risk-critical";
  holdFulfillment: boolean;
}

export interface AddressInput {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface VelocityCounts {
  phoneOrders?: number;
  emailOrders?: number;
  addressOrders?: number;
  ipOrders?: number;
  deviceOrders?: number;
  windowDays?: number;
}

export interface PastHistoryCounts {
  rtoCount?: number;
  refusedCount?: number;
  cancelledCount?: number;
}

export interface LearnedRate {
  /** RTO rate in [0, 1], e.g. 0.35 = 35% of past orders RTO'd. */
  rtoRate: number;
  /** Number of past orders behind the rate. */
  sampleSize: number;
  productId?: string;
  city?: string;
}

export interface ScoreOrderInput {
  customerName?: string;
  phone?: string;
  /** ISO country code used for the phone-format check, e.g. "PK". */
  phoneCountry?: string;
  email?: string;
  shippingAddress?: AddressInput;
  billingAddress?: AddressInput;
  /** Explicit mismatch flag (e.g. from a pincode/city lookup). */
  addressCityPostalMismatch?: boolean;
  velocity?: VelocityCounts;
  pastHistory?: PastHistoryCounts;
  orderValue?: number;
  quantity?: number;
  storeAverageOrderValue?: number;
  storeAverageQuantity?: number;
  isFirstTimeCustomer?: boolean;
  paymentMethod?: string; // "cod" | "prepaid" | ...
  /** Hour of day (0-23) the order was placed. Prefer over orderedAt. */
  orderedAtHour?: number;
  orderedAt?: string; // ISO timestamp; hour taken in UTC
  nightWindow?: { start: number; end: number };
  isProxyOrVpn?: boolean;
  /** Per-product learned RTO rates; the worst qualifying product counts. */
  productHistory?: LearnedRate[];
  /** Learned RTO rate for the order's destination city. */
  cityHistory?: LearnedRate;
  /** Minimum past orders before a learned rate is trusted. Default 10. */
  minSample?: number;
}

export type MerchantVerdict = "fake" | "genuine";

export interface FeedbackAdjustment {
  adjustedWeights: Record<string, number>;
  direction: "increase" | "decrease" | "none";
  note: string;
}

export interface DailyMetric {
  date: string;
  orders: number;
  refunds: number;
  revenue: number;
}

export interface DiscountCodeUsage {
  code: string;
  count: number;
}

export interface ProductOrderCount {
  productId: string;
  productName?: string;
  orders: number;
}

export interface StoreAnomalyInput {
  daily: DailyMetric[];
  discountCodes?: DiscountCodeUsage[];
  productOrders?: ProductOrderCount[];
}

export type AnomalyType =
  | "order-spike"
  | "refund-spike"
  | "discount-code-abuse"
  | "product-dominance";

export interface StoreAnomaly {
  type: AnomalyType;
  date?: string;
  code?: string;
  productId?: string;
  detail: string;
  /** Leave-one-out z-score where applicable; null for share-based checks. */
  zScore: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Common disposable / throwaway email domains. This is a built-in starter
 * list, not an exhaustive registry; tenants can extend it at the call site
 * by pre-checking and passing the result in via other signals, but the
 * engine itself stays dependency-free.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "mailinator.com",
  "mailinator.net",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.com",
  "tempmail.net",
  "tempail.com",
  "10minutemail.com",
  "10minutemail.net",
  "yopmail.com",
  "yopmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "fakeinbox.com",
  "getnada.com",
  "mohmal.com",
  "sharklasers.com",
  "spamgourmet.com",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "mintemail.com",
  "mytemp.email",
  "inboxbear.com",
  "emailondeck.com",
  "harakirimail.com",
  "spam4.me",
  "jetable.org",
];

/** Expected international prefix and national-digit length per country. */
const PHONE_FORMATS: Record<string, { prefix: string; nationalDigits: number }> = {
  PK: { prefix: "+92", nationalDigits: 10 },
  US: { prefix: "+1", nationalDigits: 10 },
  CA: { prefix: "+1", nationalDigits: 10 },
  GB: { prefix: "+44", nationalDigits: 10 },
  IN: { prefix: "+91", nationalDigits: 10 },
  AE: { prefix: "+971", nationalDigits: 9 },
  SA: { prefix: "+966", nationalDigits: 9 },
  BD: { prefix: "+880", nationalDigits: 10 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Small helpers ───────────────────────────────────────────────────────────

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function lettersOnly(value: string): string {
  return value.replace(/[^a-z]/gi, "");
}

/**
 * Heuristic gibberish check on a name/street fragment: very low vowel
 * ratio, a run of 5+ consonants, a run of 4+ identical characters, or
 * digits inside a person name. Deterministic; short strings (<4 letters)
 * are never flagged on vowel ratio alone so short real names are safe.
 */
function isGibberish(value: string | undefined): { gibberish: boolean; why: string } {
  const raw = (value ?? "").trim();
  const letters = lettersOnly(raw);
  if (letters.length < 4) return { gibberish: false, why: "" };
  if (/(.)\1{3,}/.test(letters.toLowerCase())) {
    return { gibberish: true, why: "repeated character run" };
  }
  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio < 0.2) {
    return { gibberish: true, why: `low vowel ratio (${vowelRatio.toFixed(2)})` };
  }
  if (/[^aeiou]{5,}/i.test(letters)) {
    return { gibberish: true, why: "long consonant run" };
  }
  return { gibberish: false, why: "" };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
}

/** Leave-one-out z-score: value vs the mean/stddev of all OTHER values. */
function leaveOneOutZ(values: number[], index: number): number | null {
  const rest = values.filter((_, i) => i !== index);
  if (rest.length < 2) return null;
  const sd = stddev(rest);
  const m = mean(rest);
  if (sd === 0) return values[index] > m ? Number.POSITIVE_INFINITY : 0;
  return (values[index] - m) / sd;
}

function bandFor(score: number): RiskScore["band"] {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function push(
  reasons: RiskSignal[],
  code: string,
  label: string,
  points: number,
  detail: string,
): void {
  if (points > 0) reasons.push({ code, label, points, detail });
}

// ─── scoreOrder ──────────────────────────────────────────────────────────────

export function scoreOrder(input: ScoreOrderInput): RiskScore {
  const reasons: RiskSignal[] = [];
  const minSample = Math.max(1, Math.floor(toMoney(input.minSample ?? 10)));

  // — Phone validity + country format —
  const phoneRaw = (input.phone ?? "").trim();
  if (phoneRaw) {
    const cleaned = phoneRaw.replace(/[\s\-()]/g, "");
    const phoneValid = /^\+?\d{7,15}$/.test(cleaned);
    if (!phoneValid) {
      push(reasons, "phone-invalid", "Invalid phone number", 15,
        `Phone "${phoneRaw}" is not a plausible international number.`);
    } else if (input.phoneCountry) {
      const fmt = PHONE_FORMATS[input.phoneCountry.toUpperCase()];
      if (fmt) {
        const national = cleaned.startsWith(fmt.prefix)
          ? cleaned.slice(fmt.prefix.length)
          : null;
        if (national === null) {
          push(reasons, "phone-country-mismatch", "Phone does not match country format", 8,
            `Phone does not start with the expected ${input.phoneCountry.toUpperCase()} prefix ${fmt.prefix}.`);
        } else if (national.length !== fmt.nationalDigits) {
          push(reasons, "phone-country-mismatch", "Phone does not match country format", 8,
            `Expected ${fmt.nationalDigits} national digits for ${input.phoneCountry.toUpperCase()}, got ${national.length}.`);
        }
      }
    }
  }

  // — Email validity + disposable domain —
  const emailRaw = (input.email ?? "").trim();
  if (emailRaw) {
    if (!EMAIL_RE.test(emailRaw)) {
      push(reasons, "email-invalid", "Invalid email address", 12,
        `Email "${emailRaw}" fails basic format validation.`);
    } else {
      const domain = emailRaw.split("@")[1].toLowerCase();
      if ((DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
        push(reasons, "email-disposable", "Disposable email domain", 15,
          `Domain "${domain}" is a known throwaway-email provider.`);
      }
    }
  }

  // — Name / address gibberish + incompleteness —
  const nameCheck = isGibberish(input.customerName);
  if (nameCheck.gibberish) {
    push(reasons, "name-gibberish", "Gibberish customer name", 12,
      `Name "${input.customerName}" looks randomly generated (${nameCheck.why}).`);
  } else if (
    input.customerName !== undefined &&
    /\d/.test(input.customerName)
  ) {
    push(reasons, "name-gibberish", "Gibberish customer name", 12,
      `Name "${input.customerName}" contains digits.`);
  }
  const ship = input.shippingAddress ?? {};
  const streetCheck = isGibberish(ship.street);
  if (streetCheck.gibberish) {
    push(reasons, "address-gibberish", "Gibberish street address", 10,
      `Street "${ship.street}" looks randomly generated (${streetCheck.why}).`);
  }
  const missingAddressParts = ["street", "city", "postalCode"].filter(
    (k) => !normalize(ship[k as keyof AddressInput]),
  );
  if (missingAddressParts.length > 0) {
    push(reasons, "address-incomplete", "Incomplete shipping address", 10,
      `Missing address fields: ${missingAddressParts.join(", ")}.`);
  }
  if (input.addressCityPostalMismatch) {
    push(reasons, "address-city-postal-mismatch", "City/postal code mismatch", 10,
      "Shipping city does not match the postal code area.");
  }

  // — Velocity: worst channel counts once (same orders must not triple-count) —
  const v = input.velocity ?? {};
  const channels: Array<[string, number]> = [
    ["phone", toMoney(v.phoneOrders)],
    ["email", toMoney(v.emailOrders)],
    ["address", toMoney(v.addressOrders)],
    ["ip", toMoney(v.ipOrders)],
    ["device", toMoney(v.deviceOrders)],
  ];
  const worst = channels.reduce((a, b) => (b[1] > a[1] ? b : a), channels[0]);
  const windowNote =
    v.windowDays !== undefined ? ` in the last ${v.windowDays} days` : "";
  if (worst[1] >= 5) {
    push(reasons, "velocity-high", "High order velocity", 20,
      `${worst[1]} orders from the same ${worst[0]}${windowNote}.`);
  } else if (worst[1] === 4) {
    push(reasons, "velocity-high", "High order velocity", 15,
      `${worst[1]} orders from the same ${worst[0]}${windowNote}.`);
  } else if (worst[1] === 3) {
    push(reasons, "velocity-high", "High order velocity", 10,
      `${worst[1]} orders from the same ${worst[0]}${windowNote}.`);
  }

  // — Past RTO / refused / cancelled history for the same identity —
  const h = input.pastHistory ?? {};
  const badTotal =
    Math.max(0, Math.floor(toMoney(h.rtoCount))) +
    Math.max(0, Math.floor(toMoney(h.refusedCount))) +
    Math.max(0, Math.floor(toMoney(h.cancelledCount)));
  if (badTotal >= 3) {
    push(reasons, "past-rto-history", "Past RTO/refused/cancelled history", 20,
      `${badTotal} prior bad outcomes (RTO ${toMoney(h.rtoCount)}, refused ${toMoney(h.refusedCount)}, cancelled ${toMoney(h.cancelledCount)}).`);
  } else if (badTotal === 2) {
    push(reasons, "past-rto-history", "Past RTO/refused/cancelled history", 14,
      `${badTotal} prior bad outcomes (RTO ${toMoney(h.rtoCount)}, refused ${toMoney(h.refusedCount)}, cancelled ${toMoney(h.cancelledCount)}).`);
  } else if (badTotal === 1) {
    push(reasons, "past-rto-history", "Past RTO/refused/cancelled history", 8,
      `1 prior bad outcome (RTO ${toMoney(h.rtoCount)}, refused ${toMoney(h.refusedCount)}, cancelled ${toMoney(h.cancelledCount)}).`);
  }

  // — Order value / quantity vs store average (guarded: avg <= 0 → no signal) —
  const orderValue = toMoney(input.orderValue);
  const avgValue = toMoney(input.storeAverageOrderValue);
  const valueRatio = avgValue > 0 ? orderValue / avgValue : 0;
  if (avgValue > 0 && valueRatio >= 5) {
    push(reasons, "value-outlier", "Order value far above store average", 15,
      `Order value ${round(orderValue)} is ${valueRatio.toFixed(1)}x the store average ${round(avgValue)}.`);
  } else if (avgValue > 0 && valueRatio >= 3) {
    push(reasons, "value-outlier", "Order value far above store average", 10,
      `Order value ${round(orderValue)} is ${valueRatio.toFixed(1)}x the store average ${round(avgValue)}.`);
  } else if (avgValue > 0 && valueRatio >= 2) {
    push(reasons, "value-outlier", "Order value above store average", 6,
      `Order value ${round(orderValue)} is ${valueRatio.toFixed(1)}x the store average ${round(avgValue)}.`);
  }
  const quantity = toMoney(input.quantity);
  const avgQty = toMoney(input.storeAverageQuantity);
  const qtyRatio = avgQty > 0 ? quantity / avgQty : 0;
  if (avgQty > 0 && qtyRatio >= 5) {
    push(reasons, "quantity-outlier", "Quantity far above store average", 10,
      `Quantity ${quantity} is ${qtyRatio.toFixed(1)}x the store average ${avgQty}.`);
  } else if (avgQty > 0 && qtyRatio >= 3) {
    push(reasons, "quantity-outlier", "Quantity above store average", 6,
      `Quantity ${quantity} is ${qtyRatio.toFixed(1)}x the store average ${avgQty}.`);
  } else if (avgQty > 0 && qtyRatio >= 2) {
    push(reasons, "quantity-outlier", "Quantity above store average", 4,
      `Quantity ${quantity} is ${qtyRatio.toFixed(1)}x the store average ${avgQty}.`);
  }

  // — First-time customer + large COD order —
  const isCod = normalize(input.paymentMethod) === "cod";
  const largeCod =
    input.isFirstTimeCustomer === true &&
    isCod &&
    (avgValue > 0 ? valueRatio >= 2 : orderValue >= 150);
  if (largeCod) {
    push(reasons, "first-time-large-cod", "First-time customer, large COD order", 15,
      avgValue > 0
        ? `First order, cash on delivery, ${valueRatio.toFixed(1)}x the store average value.`
        : `First order, cash on delivery, value ${round(orderValue)}.`);
  }

  // — Odd-hours order (configurable night window, wrap-aware) —
  let hour: number | undefined = input.orderedAtHour;
  if (hour === undefined && input.orderedAt) {
    const parsed = new Date(input.orderedAt);
    if (!Number.isNaN(parsed.getTime())) hour = parsed.getUTCHours();
  }
  const night = input.nightWindow ?? { start: 0, end: 5 };
  if (hour !== undefined && Number.isFinite(hour)) {
    const h24 = ((Math.floor(hour) % 24) + 24) % 24;
    const inWindow =
      night.start <= night.end
        ? h24 >= night.start && h24 < night.end
        : h24 >= night.start || h24 < night.end;
    if (inWindow) {
      push(reasons, "odd-hours", "Order placed at odd hours", 6,
        `Order placed at hour ${h24}:00, inside the night window ${night.start}:00-${night.end}:00.`);
    }
  }

  // — Billing vs shipping mismatch (explicit flag, else computed) —
  const bill = input.billingAddress;
  let billingMismatch = false;
  let billingDetail = "Billing and shipping addresses differ.";
  if (bill && (bill.street || bill.city || bill.postalCode)) {
    const diffs: string[] = [];
    if (bill.city && ship.city && normalize(bill.city) !== normalize(ship.city)) {
      diffs.push(`city (${bill.city} vs ${ship.city})`);
    }
    if (bill.postalCode && ship.postalCode && normalize(bill.postalCode) !== normalize(ship.postalCode)) {
      diffs.push(`postal code (${bill.postalCode} vs ${ship.postalCode})`);
    }
    if (bill.street && ship.street && normalize(bill.street) !== normalize(ship.street)) {
      diffs.push("street address");
    }
    if (diffs.length > 0) {
      billingMismatch = true;
      billingDetail = `Billing differs from shipping on: ${diffs.join(", ")}.`;
    }
  }
  if (billingMismatch) {
    push(reasons, "billing-shipping-mismatch", "Billing vs shipping mismatch", 10, billingDetail);
  }

  // — Proxy / VPN hint (only when the caller has such data) —
  if (input.isProxyOrVpn === true) {
    push(reasons, "proxy-vpn", "Order placed via proxy/VPN", 10,
      "IP intelligence flagged the order's network as a proxy or VPN.");
  }

  // — Learned high-risk product / city (only with a trustworthy sample) —
  const qualifyingProducts = (input.productHistory ?? []).filter(
    (p) => toMoney(p.sampleSize) >= minSample && toMoney(p.rtoRate) > 0,
  );
  const worstProduct = qualifyingProducts.reduce<LearnedRate | undefined>(
    (a, b) => (a === undefined || toMoney(b.rtoRate) > toMoney(a.rtoRate) ? b : a),
    undefined,
  );
  if (worstProduct) {
    const rate = toMoney(worstProduct.rtoRate);
    if (rate >= 0.4) {
      push(reasons, "high-risk-product", "High-RTO product", 14,
        `Product ${worstProduct.productId ?? "(unknown)"} has a ${(rate * 100).toFixed(0)}% RTO rate over ${worstProduct.sampleSize} past orders.`);
    } else if (rate >= 0.25) {
      push(reasons, "high-risk-product", "High-RTO product", 10,
        `Product ${worstProduct.productId ?? "(unknown)"} has a ${(rate * 100).toFixed(0)}% RTO rate over ${worstProduct.sampleSize} past orders.`);
    }
  }
  const city = input.cityHistory;
  if (city && toMoney(city.sampleSize) >= minSample) {
    const rate = toMoney(city.rtoRate);
    if (rate >= 0.4) {
      push(reasons, "high-risk-city", "High-RTO destination city", 12,
        `Destination ${city.city ?? "(unknown)"} has a ${(rate * 100).toFixed(0)}% RTO rate over ${city.sampleSize} past orders.`);
    } else if (rate >= 0.25) {
      push(reasons, "high-risk-city", "High-RTO destination city", 8,
        `Destination ${city.city ?? "(unknown)"} has a ${(rate * 100).toFixed(0)}% RTO rate over ${city.sampleSize} past orders.`);
    }
  }

  const rawTotal = reasons.reduce((s, r) => s + r.points, 0);
  const score = Math.min(100, Math.max(0, rawTotal));
  const band = bandFor(score);
  return {
    score,
    band,
    reasons,
    autoTag: `risk-${band}`,
    holdFulfillment: band === "high" || band === "critical",
  };
}

// ─── detectStoreAnomalies ────────────────────────────────────────────────────

export function detectStoreAnomalies(input: StoreAnomalyInput): StoreAnomaly[] {
  const anomalies: StoreAnomaly[] = [];
  const daily = input.daily ?? [];

  // Minimum-history guard: with fewer than 7 days there is no baseline
  // worth trusting, so no anomaly is reported at all.
  if (daily.length >= 7) {
    const orderCounts = daily.map((d) => toMoney(d.orders));
    const refundCounts = daily.map((d) => toMoney(d.refunds));
    daily.forEach((day, i) => {
      const orderZ = leaveOneOutZ(orderCounts, i);
      if (orderZ !== null && (orderZ >= 3 || orderZ === Number.POSITIVE_INFINITY)) {
        anomalies.push({
          type: "order-spike",
          date: day.date,
          detail: `Orders on ${day.date} (${toMoney(day.orders)}) spiked vs the other days (mean ${round(mean(orderCounts.filter((_, j) => j !== i)))}).`,
          zScore: orderZ === Number.POSITIVE_INFINITY ? null : round(orderZ, 2),
        });
      }
      const refundZ = leaveOneOutZ(refundCounts, i);
      if (refundZ !== null && (refundZ >= 3 || refundZ === Number.POSITIVE_INFINITY)) {
        anomalies.push({
          type: "refund-spike",
          date: day.date,
          detail: `Refunds on ${day.date} (${toMoney(day.refunds)}) spiked vs the other days (mean ${round(mean(refundCounts.filter((_, j) => j !== i)))}).`,
          zScore: refundZ === Number.POSITIVE_INFINITY ? null : round(refundZ, 2),
        });
      }
    });
  }

  // Discount-code abuse: a single code dominating all discounted orders.
  const codes = (input.discountCodes ?? [])
    .map((c) => ({ code: c.code, count: Math.max(0, Math.floor(toMoney(c.count))) }))
    .sort((a, b) => b.count - a.count);
  const codeTotal = codes.reduce((s, c) => s + c.count, 0);
  if (codes.length > 0 && codeTotal >= 10) {
    const top = codes[0];
    const share = top.count / codeTotal;
    if (share > 0.5) {
      anomalies.push({
        type: "discount-code-abuse",
        code: top.code,
        detail: `Discount code "${top.code}" accounts for ${top.count} of ${codeTotal} discounted orders (${(share * 100).toFixed(0)}%).`,
        zScore: null,
      });
    }
  }

  // Single-product dominance: one product taking over half of all orders.
  const products = (input.productOrders ?? [])
    .map((p) => ({ productId: p.productId, orders: Math.max(0, Math.floor(toMoney(p.orders))) }))
    .sort((a, b) => b.orders - a.orders);
  const productTotal = products.reduce((s, p) => s + p.orders, 0);
  if (products.length > 0 && productTotal >= 10) {
    const top = products[0];
    const share = top.orders / productTotal;
    if (share > 0.5) {
      anomalies.push({
        type: "product-dominance",
        productId: top.productId,
        detail: `Product ${top.orders} of ${productTotal} orders (${(share * 100).toFixed(0)}%) in the period.`,
        zScore: null,
      });
    }
  }

  return anomalies;
}

// ─── Merchant feedback / calibration ─────────────────────────────────────────

/**
 * Calibration weight for ONE signal code.
 *
 * A "fake" verdict on an order that scored LOW means the engine missed
 * something: raise the weight of the signals that did fire (x1.25).
 * A "genuine" verdict on an order that scored HIGH means the engine
 * over-reacted: lower the weight of the signals that fired (x0.8).
 * Otherwise the weight is unchanged. Weights always stay in [0.5, 2.0]
 * so feedback can nudge the model but never silence or explode a signal.
 * Deterministic: same inputs always give the same output.
 */
export function feedbackWeight(
  currentWeight: number,
  verdict: MerchantVerdict,
  score: number,
): number {
  const current = Number.isFinite(currentWeight) ? currentWeight : 1;
  let next = current;
  if (verdict === "fake" && score < 55) next = current * 1.25;
  if (verdict === "genuine" && score >= 55) next = current * 0.8;
  return round(Math.min(2.0, Math.max(0.5, next)), 4);
}

/**
 * Apply a merchant verdict to a scored order. Returns an adjusted weight
 * map for every signal code that fired, plus a human-readable direction
 * note. The caller persists the map and multiplies future signal points
 * by it (weight 1 = unchanged); this function itself never mutates state.
 */
export function applyMerchantFeedback(input: {
  score: number;
  verdict: MerchantVerdict;
  signalCodes: string[];
  currentWeights?: Record<string, number>;
}): FeedbackAdjustment {
  const { score, verdict, signalCodes } = input;
  const current = input.currentWeights ?? {};
  const adjustedWeights: Record<string, number> = {};
  for (const code of signalCodes) {
    adjustedWeights[code] = feedbackWeight(current[code] ?? 1, verdict, score);
  }
  const direction: FeedbackAdjustment["direction"] =
    verdict === "fake" && score < 55
      ? "increase"
      : verdict === "genuine" && score >= 55
        ? "decrease"
        : "none";
  const note =
    direction === "increase"
      ? `Merchant marked a low-scoring order (score ${score}) as fake: weights for ${signalCodes.length} triggered signal(s) increased so similar orders score higher next time.`
      : direction === "decrease"
        ? `Merchant marked a high-scoring order (score ${score}) as genuine: weights for ${signalCodes.length} triggered signal(s) decreased so similar orders score lower next time.`
        : `Verdict "${verdict}" on score ${score} is consistent with the engine's assessment: weights unchanged.`;
  return { adjustedWeights, direction, note };
}

// ─── Money saved / lost ──────────────────────────────────────────────────────

/**
 * Money semantics (read before using in a dashboard):
 * - preventedFakeValue(orderValue) = the full order value protected when
 *   a fake order is blocked before fulfilment. This is "value at risk",
 *   not cash already spent.
 * - rtoLoss(shippingCost, packagingCost) = the loss actually incurred
 *   when an order returns to origin: outbound shipping + packaging are
 *   gone, the product comes back.
 * - moneySaved(orderValue, shippingCost, packagingCost, isRto) reports
 *   the amount at stake for one order: for a prevented fake order it is
 *   the protected order value; for an order that did RTO it is the
 *   realised shipping + packaging loss. Callers aggregating a "money
 *   saved" headline should sum preventedFakeValue over blocked orders
 *   only, and report rtoLoss separately as realised loss — the two
 *   cases measure different things and must not be mixed in one total.
 */
export function preventedFakeValue(orderValue: number): number {
  return round(toMoney(orderValue));
}

export function rtoLoss(shippingCost: number, packagingCost: number): number {
  return round(toMoney(shippingCost) + toMoney(packagingCost));
}

export function moneySaved(
  orderValue: number,
  shippingCost: number,
  packagingCost: number,
  isRto: boolean,
): number {
  return isRto
    ? rtoLoss(shippingCost, packagingCost)
    : preventedFakeValue(orderValue);
}
