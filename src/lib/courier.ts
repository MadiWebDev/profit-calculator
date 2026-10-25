/**
 * Courier performance module — Phase 6 (pure functions only).
 *
 * No database access, no network calls, no side effects. Every function
 * here is deterministic and unit-testable; adapters, CSV import and
 * aggregation all run on plain in-memory data so the API/DB layers can
 * reuse them without coupling.
 *
 * Money values are rounded to 2 decimals, rates to 2 decimals, via
 * `round` / `toMoney` from `@/lib/profit-engine` (which never produce NaN).
 */
import { round, toMoney } from "@/lib/profit-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShipmentStatus =
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_attempt"
  | "returned_rto"
  | "cancelled";

export interface ShipmentInput {
  courier: string;
  city: string;
  region: string;
  postalCode: string;
  status: ShipmentStatus;
  cost: number;
  codAmount: number;
  codCollected: boolean;
  codSettledAt?: Date;
  bookedAt: Date;
  deliveredAt?: Date;
  attempts: number;
  createdAt: Date;
}

/** A shipment parsed from CSV — the input shape plus its tracking number. */
export interface ParsedShipment extends ShipmentInput {
  trackingNumber: string;
}

export interface CourierAdapter {
  name: string;
  supportsTracking: boolean;
  normalizeStatus(raw: string): ShipmentStatus | null;
}

export interface CourierMetrics {
  courier: string;
  total: number;
  delivered: number;
  /** Delivered / total, as a percentage (0–100). */
  deliverySuccessRate: number;
  /** Returned-to-origin / total, as a percentage (0–100). */
  rtoRate: number;
  /** Mean booked → delivered days, delivered shipments only. 0 if none. */
  avgDeliveryDays: number;
  /** Delivered on the first attempt / delivered, as a percentage. 0 if none. */
  firstAttemptSuccessRate: number;
  /** Mean shipping cost per shipment. */
  costPerShipment: number;
  /** Mean delivered → COD-settled days, settled delivered COD only. 0 if none. */
  avgCodSettlementDays: number;
  /** (Failed attempts + RTO) / total, as a percentage (0–100). */
  exceptionRate: number;
}

export interface CityCourierMetrics extends CourierMetrics {
  city: string;
  cityKey: string;
}

export interface RegionCourierMetrics extends CourierMetrics {
  region: string;
  regionKey: string;
}

export interface RankedCourier {
  courier: string;
  score: number;
  confidence: "low" | "medium" | "high";
  metrics: CourierMetrics;
  sample: number;
}

export interface InsufficientCourier {
  courier: string;
  confidence: "low";
  metrics: CourierMetrics;
  sample: number;
}

export interface CourierRanking {
  ranked: RankedCourier[];
  insufficientData: InsufficientCourier[];
}

export interface SwitchingProfitImpact {
  eligible: boolean;
  bestCourier: string | null;
  currentCostPerShipment: number;
  bestCostPerShipment: number;
  currentRtoRate: number;
  bestRtoRate: number;
  /** Estimated extra profit per shipment from switching. 0 when ineligible. */
  extraProfitPerShipment: number;
  extraProfitPer100Shipments: number;
}

export interface CsvError {
  line: number;
  reason: string;
}

export interface CsvParseResult {
  shipments: ParsedShipment[];
  errors: CsvError[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDate(value: Date | string | number | undefined | null): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round((numerator / denominator) * 100);
}

// ─── Normalisation ────────────────────────────────────────────────────────────

/** Lowercase lookup key: trimmed, internal whitespace collapsed. */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Title-case display name derived from a normalised key. */
function toDisplayName(key: string): string {
  if (key === "") return "";
  return key
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ─── Status normalisation / generic adapter ──────────────────────────────────

/**
 * Map a raw courier status string to a ShipmentStatus.
 * Matching is case-insensitive and tolerant of spaces, hyphens and
 * underscores ("Out-For_Delivery" works). Unknown or empty input → null,
 * never a guessed status.
 *
 * Check order matters: "delivery failed" must not match "delivered",
 * and "out for delivery" must not fall through to "in transit".
 */
export function normalizeShipmentStatus(raw: string): ShipmentStatus | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (s === "") return null;

  if (s === "rto" || s.includes("cancel")) return s === "rto" ? "returned_rto" : "cancelled";
  if (s.includes("return") || s.includes("rto") || s.includes("refused"))
    return "returned_rto";
  if (s.includes("out for delivery") || s === "ofd") return "out_for_delivery";
  if (s.includes("delivered") || s.includes("delivery completed"))
    return "delivered";
  if (s.includes("fail") || s.includes("undeliver") || s.includes("not delivered"))
    return "failed_attempt";
  if (s.includes("picked") || s.includes("pick up") || s.includes("pickup") || s.includes("collected"))
    return "picked_up";
  if (
    s.includes("in transit") ||
    s.includes("transit") ||
    s.includes("shipped") ||
    s.includes("dispatched") ||
    s.includes("on the way") ||
    s.includes("arrived at")
  )
    return "in_transit";
  if (
    s.includes("booked") ||
    s.includes("booking") ||
    s.includes("label created") ||
    s.includes("manifest") ||
    s === "created" ||
    s === "pending"
  )
    return "booked";
  return null;
}

export class GenericTrackingAdapter implements CourierAdapter {
  readonly name = "generic";
  readonly supportsTracking = true;

  normalizeStatus(raw: string): ShipmentStatus | null {
    return normalizeShipmentStatus(raw);
  }
}

/** Shared instance for callers that just need the generic mapping. */
export const genericTrackingAdapter = new GenericTrackingAdapter();

// ─── CSV parsing (hand-written, no dependency) ────────────────────────────────

/**
 * Parse one CSV document into rows of fields.
 * Handles quoted fields (commas and escaped double-quotes inside quotes),
 * CRLF and LF line endings. Returns rows with the 1-based line number on
 * which each row starts, so errors can point at the offending row.
 */
function parseCsvRows(csv: string): { fields: string[]; line: number }[] {
  const rows: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowStartLine = 1;
  let line = 1;
  let fieldStarted = false;

  const pushField = () => {
    fields.push(field);
    field = "";
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    rows.push({ fields, line: rowStartLine });
    fields = [];
    // The caller increments `line` for the break just consumed, so the
    // next row starts on the following line.
    rowStartLine = line + 1;
  };

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
        if (ch === "\n") line += 1;
      }
      continue;
    }
    if (ch === '"') {
      // A quote only opens a quoted field at the start of a field.
      if (!fieldStarted && field === "") {
        inQuotes = true;
        fieldStarted = true;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\r") {
      // CRLF: swallow the following LF as part of the same break.
      if (csv[i + 1] === "\n") i += 1;
      pushRow();
      line += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      line += 1;
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  // Trailing content without a final newline still forms a row.
  if (field !== "" || fieldStarted || fields.length > 0) {
    pushRow();
  }
  return rows;
}

function parseNumberField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseBoolField(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "") return null;
  if (v === "true" || v === "1" || v === "yes" || v === "y") return true;
  if (v === "false" || v === "0" || v === "no" || v === "n") return false;
  return null;
}

/**
 * Parse a header-row CSV of shipment/tracking reports.
 *
 * Expected columns (all matched case-insensitively, spaces or underscores):
 * tracking_number, courier, city, region, postal_code, status, cost,
 * cod_amount, cod_collected, booked_at, delivered_at, attempts.
 * Missing optional columns are tolerated (city/region/postal default to "",
 * costs to 0, attempts to 1, dates to the row's booked date / now).
 *
 * A bad row never throws: it is skipped and recorded in `errors` with its
 * line number and reason. Fully blank rows are skipped silently.
 */
export function parseShipmentCsv(csv: string): CsvParseResult {
  const shipments: ParsedShipment[] = [];
  const errors: CsvError[] = [];
  const rows = parseCsvRows(csv);
  if (rows.length === 0) return { shipments, errors };

  const header = rows[0].fields.map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const col = (name: string): number => header.indexOf(name);
  const get = (fields: string[], name: string): string => {
    const idx = col(name);
    if (idx < 0 || idx >= fields.length) return "";
    return fields[idx];
  };

  for (const row of rows.slice(1)) {
    const fields = row.fields;
    if (fields.every((f) => f.trim() === "")) continue;

    const courier = get(fields, "courier").trim();
    if (courier === "") {
      errors.push({ line: row.line, reason: "missing courier" });
      continue;
    }
    const rawStatus = get(fields, "status").trim();
    if (rawStatus === "") {
      errors.push({ line: row.line, reason: "missing status" });
      continue;
    }
    const status = normalizeShipmentStatus(rawStatus);
    if (status === null) {
      errors.push({ line: row.line, reason: `unknown status: "${rawStatus}"` });
      continue;
    }

    const costRaw = get(fields, "cost");
    const cost = costRaw.trim() === "" ? 0 : parseNumberField(costRaw);
    if (cost === null) {
      errors.push({ line: row.line, reason: `invalid cost: "${costRaw.trim()}"` });
      continue;
    }
    const codRaw = get(fields, "cod_amount");
    const codAmount = codRaw.trim() === "" ? 0 : parseNumberField(codRaw);
    if (codAmount === null) {
      errors.push({ line: row.line, reason: `invalid cod_amount: "${codRaw.trim()}"` });
      continue;
    }
    const codCollectedRaw = get(fields, "cod_collected");
    const codCollectedParsed = parseBoolField(codCollectedRaw);
    if (codCollectedRaw.trim() !== "" && codCollectedParsed === null) {
      errors.push({
        line: row.line,
        reason: `invalid cod_collected: "${codCollectedRaw.trim()}"`,
      });
      continue;
    }
    const attemptsRaw = get(fields, "attempts");
    let attempts = 1;
    if (attemptsRaw.trim() !== "") {
      const parsed = parseNumberField(attemptsRaw);
      if (parsed === null || !Number.isInteger(parsed) || parsed < 0) {
        errors.push({
          line: row.line,
          reason: `invalid attempts: "${attemptsRaw.trim()}"`,
        });
        continue;
      }
      attempts = parsed;
    }
    const bookedRaw = get(fields, "booked_at");
    let bookedAt: Date | null = null;
    if (bookedRaw.trim() !== "") {
      bookedAt = toDate(bookedRaw.trim());
      if (bookedAt === null) {
        errors.push({
          line: row.line,
          reason: `invalid booked_at: "${bookedRaw.trim()}"`,
        });
        continue;
      }
    }
    const deliveredRaw = get(fields, "delivered_at");
    let deliveredAt: Date | undefined;
    if (deliveredRaw.trim() !== "") {
      const parsed = toDate(deliveredRaw.trim());
      if (parsed === null) {
        errors.push({
          line: row.line,
          reason: `invalid delivered_at: "${deliveredRaw.trim()}"`,
        });
        continue;
      }
      deliveredAt = parsed;
    }

    const now = bookedAt ?? new Date();
    shipments.push({
      trackingNumber: get(fields, "tracking_number").trim(),
      courier,
      city: get(fields, "city").trim(),
      region: get(fields, "region").trim(),
      postalCode: get(fields, "postal_code").trim(),
      status,
      cost: toMoney(cost),
      codAmount: toMoney(codAmount),
      codCollected: codCollectedParsed ?? false,
      bookedAt: bookedAt ?? now,
      deliveredAt,
      attempts,
      createdAt: bookedAt ?? now,
    });
  }
  return { shipments, errors };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function aggregateMetrics(courier: string, list: ShipmentInput[]): CourierMetrics {
  const total = list.length;
  const deliveredList = list.filter((s) => s.status === "delivered");
  const delivered = deliveredList.length;
  const rto = list.filter((s) => s.status === "returned_rto").length;
  const exceptions = list.filter(
    (s) => s.status === "failed_attempt" || s.status === "returned_rto",
  ).length;

  const deliveryDays = deliveredList
    .map((s) => {
      const booked = toDate(s.bookedAt);
      const deliveredAt = toDate(s.deliveredAt);
      return booked && deliveredAt ? daysBetween(booked, deliveredAt) : null;
    })
    .filter((d): d is number => d !== null);
  const firstAttemptDelivered = deliveredList.filter(
    (s) => s.attempts <= 1,
  ).length;

  const settledCodDays = deliveredList
    .map((s) => {
      if (!s.codCollected) return null;
      const deliveredAt = toDate(s.deliveredAt);
      const settledAt = toDate(s.codSettledAt);
      return deliveredAt && settledAt ? daysBetween(deliveredAt, settledAt) : null;
    })
    .filter((d): d is number => d !== null);

  return {
    courier,
    total,
    delivered,
    deliverySuccessRate: pct(delivered, total),
    rtoRate: pct(rto, total),
    avgDeliveryDays: round(mean(deliveryDays)),
    firstAttemptSuccessRate: pct(firstAttemptDelivered, delivered),
    costPerShipment: round(toMoney(mean(list.map((s) => toMoney(s.cost))))),
    avgCodSettlementDays: round(mean(settledCodDays)),
    exceptionRate: pct(exceptions, total),
  };
}

function emptyMetrics(courier: string): CourierMetrics {
  return {
    courier,
    total: 0,
    delivered: 0,
    deliverySuccessRate: 0,
    rtoRate: 0,
    avgDeliveryDays: 0,
    firstAttemptSuccessRate: 0,
    costPerShipment: 0,
    avgCodSettlementDays: 0,
    exceptionRate: 0,
  };
}

/** Per-courier aggregates across all given shipments. Empty input → []. */
export function courierMetrics(shipments: ShipmentInput[]): CourierMetrics[] {
  const byCourier = new Map<string, ShipmentInput[]>();
  for (const s of shipments) {
    const list = byCourier.get(s.courier) ?? [];
    list.push(s);
    byCourier.set(s.courier, list);
  }
  return [...byCourier.entries()]
    .map(([courier, list]) => aggregateMetrics(courier, list))
    .sort((a, b) => a.courier.localeCompare(b.courier));
}

/**
 * Same metrics grouped by courier + city and by courier + region.
 * City/region keys are normalised (trim + lowercase, whitespace collapsed)
 * so "  KARACHI ", "Karachi" and "karachi" group together; the display
 * name is the title-cased form of the key.
 */
export function cityMetrics(shipments: ShipmentInput[]): {
  byCity: CityCourierMetrics[];
  byRegion: RegionCourierMetrics[];
} {
  const byCity = new Map<string, Map<string, ShipmentInput[]>>();
  const byRegion = new Map<string, Map<string, ShipmentInput[]>>();
  const group = (
    outer: Map<string, Map<string, ShipmentInput[]>>,
    courier: string,
    key: string,
    s: ShipmentInput,
  ) => {
    let inner = outer.get(courier);
    if (!inner) {
      inner = new Map();
      outer.set(courier, inner);
    }
    const list = inner.get(key) ?? [];
    list.push(s);
    inner.set(key, list);
  };
  for (const s of shipments) {
    group(byCity, s.courier, normalizeKey(s.city), s);
    group(byRegion, s.courier, normalizeKey(s.region), s);
  }
  const byCityOut: CityCourierMetrics[] = [...byCity.entries()].flatMap(
    ([courier, inner]) =>
      [...inner.entries()].map(([cityKey, list]) => ({
        ...aggregateMetrics(courier, list),
        city: toDisplayName(cityKey),
        cityKey,
      })),
  );
  const byRegionOut: RegionCourierMetrics[] = [...byRegion.entries()].flatMap(
    ([courier, inner]) =>
      [...inner.entries()].map(([regionKey, list]) => ({
        ...aggregateMetrics(courier, list),
        region: toDisplayName(regionKey),
        regionKey,
      })),
  );
  byCityOut.sort((a, b) => a.courier.localeCompare(b.courier) || a.cityKey.localeCompare(b.cityKey));
  byRegionOut.sort((a, b) => a.courier.localeCompare(b.courier) || a.regionKey.localeCompare(b.regionKey));
  return { byCity: byCityOut, byRegion: byRegionOut };
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

export interface RankCouriersOptions {
  minSample?: number;
}

function confidenceFor(sample: number): "low" | "medium" | "high" {
  if (sample >= 100) return "high";
  if (sample >= 50) return "medium";
  return "low";
}

/**
 * Weighted ranking score (0–100, documented so merchants can trust it):
 *   score = 0.60 × deliverySuccessRate
 *         + 0.20 × speedScore   (100 at 0 days, −10 per day, floored at 0)
 *         + 0.20 × costScore    (cheapest ranked courier = 100, scaled
 *                                linearly against the priciest ranked
 *                                courier; 100 when all costs are equal)
 * Success rate dominates: a cheap courier that fails deliveries cannot
 * outrank a pricier reliable one on cost or speed alone.
 */
function rankingScore(m: CourierMetrics, maxCost: number): number {
  const speedScore = Math.max(0, 100 - m.avgDeliveryDays * 10);
  const costScore =
    maxCost > 0 ? round((1 - m.costPerShipment / maxCost) * 100) : 100;
  return round(
    0.6 * m.deliverySuccessRate + 0.2 * speedScore + 0.2 * costScore,
  );
}

/**
 * Rank couriers for one destination.
 *
 * Destination filter: when `city` is non-empty, only shipments in that
 * city (normalised) are considered; otherwise shipments in `region` are
 * used. Couriers with sample >= minSample (default 20) are ranked
 * descending by score; couriers below minSample are returned separately
 * in `insufficientData` with confidence "low" and are NEVER presented as
 * a recommendation — ranking on tiny data would mislead.
 */
export function rankCouriersForDestination(
  shipments: ShipmentInput[],
  city: string,
  region: string,
  opts: RankCouriersOptions = {},
): CourierRanking {
  const minSample = opts.minSample ?? 20;
  const cityKey = normalizeKey(city);
  const regionKey = normalizeKey(region);
  const scoped = shipments.filter((s) =>
    cityKey !== ""
      ? normalizeKey(s.city) === cityKey
      : regionKey !== ""
        ? normalizeKey(s.region) === regionKey
        : true,
  );
  const metrics = courierMetrics(scoped);
  const eligible = metrics.filter((m) => m.total >= minSample);
  const maxCost =
    eligible.length > 0 ? Math.max(...eligible.map((m) => m.costPerShipment)) : 0;

  const ranked: RankedCourier[] = eligible
    .map((m) => ({
      courier: m.courier,
      score: rankingScore(m, maxCost),
      confidence: confidenceFor(m.total),
      metrics: m,
      sample: m.total,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || b.sample - a.sample || a.courier.localeCompare(b.courier),
    );
  const insufficientData: InsufficientCourier[] = metrics
    .filter((m) => m.total < minSample)
    .map((m) => ({
      courier: m.courier,
      confidence: "low" as const,
      metrics: m,
      sample: m.total,
    }))
    .sort((a, b) => b.sample - a.sample || a.courier.localeCompare(b.courier));
  return { ranked, insufficientData };
}

// ─── Switching profit impact ──────────────────────────────────────────────────

/**
 * Estimated extra profit from switching a city's mix to its best-ranked
 * courier: (current cost/shipment − best cost/shipment) +
 * (current RTO rate − best RTO rate) × lostCostPerRto.
 * `lostCostPerRto` is the shipping + packaging cost lost on each RTO.
 * Returns eligible=false with 0 extra profit when no courier meets
 * minSample — never a recommendation built on tiny data.
 */
export function switchingProfitImpact(
  shipments: ShipmentInput[],
  city: string,
  lostCostPerRto: number,
  opts: RankCouriersOptions = {},
): SwitchingProfitImpact {
  const cityKey = normalizeKey(city);
  const scoped = shipments.filter((s) => normalizeKey(s.city) === cityKey);
  const current =
    scoped.length > 0 ? aggregateMetrics("", scoped) : emptyMetrics("");
  const { ranked } = rankCouriersForDestination(shipments, city, "", opts);
  const best = ranked[0];
  if (!best) {
    return {
      eligible: false,
      bestCourier: null,
      currentCostPerShipment: current.costPerShipment,
      bestCostPerShipment: 0,
      currentRtoRate: current.rtoRate,
      bestRtoRate: 0,
      extraProfitPerShipment: 0,
      extraProfitPer100Shipments: 0,
    };
  }
  const costSaving = current.costPerShipment - best.metrics.costPerShipment;
  const rtoSaving =
    ((current.rtoRate - best.metrics.rtoRate) / 100) * toMoney(lostCostPerRto);
  const extra = round(costSaving + rtoSaving);
  return {
    eligible: true,
    bestCourier: best.courier,
    currentCostPerShipment: current.costPerShipment,
    bestCostPerShipment: best.metrics.costPerShipment,
    currentRtoRate: current.rtoRate,
    bestRtoRate: best.metrics.rtoRate,
    extraProfitPerShipment: extra,
    extraProfitPer100Shipments: round(extra * 100),
  };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Shipments still in transit / out for delivery whose booked age exceeds
 * `stuckAfterDays` (default 5). Age is measured from bookedAt (createdAt
 * fallback); strictly older than the threshold counts as stuck.
 */
export function stuckShipments(
  shipments: ShipmentInput[],
  now: Date,
  stuckAfterDays = 5,
): ShipmentInput[] {
  const nowMs = toDate(now)?.getTime() ?? Date.now();
  return shipments.filter((s) => {
    if (s.status !== "in_transit" && s.status !== "out_for_delivery") return false;
    const start = toDate(s.bookedAt) ?? toDate(s.createdAt);
    if (!start) return false;
    return daysBetween(start, new Date(nowMs)) > stuckAfterDays;
  });
}

/**
 * Delivered COD shipments where cash was collected but not settled and
 * the settlement delay beyond deliveredAt exceeds `delayDays` (default 7).
 * Settled shipments and non-COD shipments are never flagged.
 */
export function settlementDelays(
  shipments: ShipmentInput[],
  now: Date,
  delayDays = 7,
): ShipmentInput[] {
  const nowMs = toDate(now)?.getTime() ?? Date.now();
  return shipments.filter((s) => {
    if (s.status !== "delivered" || !s.codCollected) return false;
    if (toDate(s.codSettledAt)) return false;
    const deliveredAt = toDate(s.deliveredAt) ?? toDate(s.bookedAt);
    if (!deliveredAt) return false;
    return daysBetween(deliveredAt, new Date(nowMs)) > delayDays;
  });
}
