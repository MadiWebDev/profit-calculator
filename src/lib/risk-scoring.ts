/**
 * Server-side risk scoring (Phase 4) — the bridge between the pure
 * engine (src/lib/risk-engine.ts) and the database.
 *
 * scoreOrderFromDb(order):
 *  - Builds the engine input from the stored order + tenant history:
 *    velocity (same phone/email/address in the last 7 days), past
 *    RTO/cancelled counts for the same phone/email, store averages,
 *    per-product and per-city learned RTO rates (minimum sample 10).
 *  - Applies learned signal weights (RiskSignalWeight) and the tenant
 *    blocklist (hashed phone/email/address): a blocklist hit adds 30
 *    points with an explicit reason — never silently.
 *  - Returns the final score; callers persist it on the order.
 *
 * scoreAndTagOrder(orderId, teamId):
 *  - Scores, persists risk fields, and — for high/critical orders —
 *    tags the order in Shopify ("risk-high"/"risk-critical") via the
 *    REST API, appending to existing tags. Tagging is best-effort:
 *    a failure is logged and never blocks scoring or ingestion.
 *
 * applyReview(orderId, teamId, verdict):
 *  - Marks the order genuine/fake, updates learned weights, and for
 *    fake orders adds the customer to the tenant blocklist (hashed)
 *    and records moneySaved = the order's gross value protected by
 *    blocking it before fulfilment (the engine's preventedFakeValue).
 *    Realised RTO loss (shipping + packaging) is a separate number
 *    and is never mixed into the money-saved total.
 */
import { createHash } from "crypto";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import OrderModel from "@/models/Order";
import StoreModel from "@/models/Store";
import BlocklistModel, { type BlocklistKind } from "@/models/Blocklist";
import RiskSignalWeightModel from "@/models/RiskSignalWeight";
import { safeDecrypt } from "@/lib/encryption";
import { adminRestBase, shopifyFetch } from "@/lib/shopify";
import { logger, toLogError } from "@/lib/logger";
import {
  scoreOrder,
  applyMerchantFeedback,
  preventedFakeValue,
  type RiskScore,
  type LearnedRate,
} from "@/lib/risk-engine";

export function hashIdentifier(kind: BlocklistKind, value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]/g, "");
  return createHash("sha256").update(`${kind}:${normalized}`).digest("hex");
}

function bandFor(score: number): RiskScore["band"] {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

type OrderDoc = {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  externalId: string;
  orderDate: Date;
  grossRevenue: number;
  shippingCost: number;
  packagingCost?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  billingCity?: string;
  billingPostalCode?: string;
  browserIp?: string;
  paymentMethod?: string;
  isFirstOrder?: boolean;
  riskReasons?: { code: string; label: string; points: number; detail: string }[];
  lineItems?: { productId?: string; quantity?: number }[];
};

async function learnedRates(
  orders: { lineItems?: { productId?: string }[]; shippingCity?: string; rtoLoss?: number }[]
): Promise<{ productHistory: LearnedRate[] }> {
  const productStats = new Map<string, { total: number; rto: number }>();
  for (const o of orders) {
    const isRto = (o.rtoLoss ?? 0) > 0;
    for (const li of o.lineItems ?? []) {
      if (!li.productId) continue;
      const cur = productStats.get(li.productId) ?? { total: 0, rto: 0 };
      cur.total++;
      if (isRto) cur.rto++;
      productStats.set(li.productId, cur);
    }
  }
  const productHistory: LearnedRate[] = [...productStats.entries()].map(([productId, s]) => ({
    productId,
    rtoRate: s.total > 0 ? s.rto / s.total : 0,
    sampleSize: s.total,
  }));
  return { productHistory };
}

export async function scoreOrderFromDb(order: OrderDoc): Promise<RiskScore> {
  await connectDB();
  const teamId = order.teamId;
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 864e5);

  const [velocityPhone, velocityEmail, velocityAddress, pastOrders, recentOrders, weights, blocklist] =
    await Promise.all([
      order.customerPhone
        ? OrderModel.countDocuments({ teamId, customerPhone: order.customerPhone, orderDate: { $gte: sevenDaysAgo }, _id: { $ne: order._id } })
        : Promise.resolve(0),
      order.customerEmail
        ? OrderModel.countDocuments({ teamId, customerEmail: order.customerEmail, orderDate: { $gte: sevenDaysAgo }, _id: { $ne: order._id } })
        : Promise.resolve(0),
      order.shippingCity && order.shippingPostalCode
        ? OrderModel.countDocuments({ teamId, shippingCity: order.shippingCity, shippingPostalCode: order.shippingPostalCode, orderDate: { $gte: sevenDaysAgo }, _id: { $ne: order._id } })
        : Promise.resolve(0),
      OrderModel.find({
        teamId,
        $or: [
          ...(order.customerPhone ? [{ customerPhone: order.customerPhone }] : []),
          ...(order.customerEmail ? [{ customerEmail: order.customerEmail }] : []),
        ],
        _id: { $ne: order._id },
      }).select("status rtoLoss").lean(),
      OrderModel.find({ teamId, orderDate: { $gte: ninetyDaysAgo }, status: { $ne: "cancelled" } })
        .select("grossRevenue lineItems shippingCity rtoLoss")
        .limit(1000)
        .lean(),
      RiskSignalWeightModel.find({ teamId }).lean(),
      BlocklistModel.find({ teamId }).select("kind valueHash").lean(),
    ]);

  const storeAverageOrderValue =
    recentOrders.length > 0
      ? recentOrders.reduce((s, o) => s + (o.grossRevenue ?? 0), 0) / recentOrders.length
      : undefined;
  const totalQty = recentOrders.reduce(
    (s: number, o: { lineItems?: { quantity?: number }[] }) => s + (o.lineItems ?? []).reduce((q: number, li: { quantity?: number }) => q + (li.quantity ?? 0), 0),
    0
  );
  const storeAverageQuantity = recentOrders.length > 0 ? totalQty / recentOrders.length : undefined;

  const { productHistory } = await learnedRates(
    recentOrders as { lineItems?: { productId?: string }[]; shippingCity?: string; rtoLoss?: number }[]
  );
  const cityStats = new Map<string, { total: number; rto: number }>();
  for (const o of recentOrders) {
    if (!o.shippingCity) continue;
    const key = o.shippingCity.toLowerCase();
    const cur = cityStats.get(key) ?? { total: 0, rto: 0 };
    cur.total++;
    if ((o.rtoLoss ?? 0) > 0) cur.rto++;
    cityStats.set(key, cur);
  }
  const cityStat = order.shippingCity ? cityStats.get(order.shippingCity.toLowerCase()) : undefined;
  const cityHistory: LearnedRate | undefined = cityStat
    ? { city: order.shippingCity, rtoRate: cityStat.total > 0 ? cityStat.rto / cityStat.total : 0, sampleSize: cityStat.total }
    : undefined;

  const paymentMethod = (order.paymentMethod ?? "").toLowerCase().includes("cod") ||
    (order.paymentMethod ?? "").toLowerCase().includes("cash")
    ? "cod"
    : "prepaid";

  const base = scoreOrder({
    customerName: order.customerName,
    phone: order.customerPhone,
    phoneCountry: order.shippingCountry,
    email: order.customerEmail,
    shippingAddress: {
      city: order.shippingCity,
      postalCode: order.shippingPostalCode,
      country: order.shippingCountry,
    },
    billingAddress: {
      city: order.billingCity,
      postalCode: order.billingPostalCode,
    },
    velocity: {
      phoneOrders: velocityPhone,
      emailOrders: velocityEmail,
      addressOrders: velocityAddress,
      windowDays: 7,
    },
    pastHistory: {
      rtoCount: pastOrders.filter((o) => (o.rtoLoss ?? 0) > 0).length,
      cancelledCount: pastOrders.filter((o) => o.status === "cancelled").length,
      refusedCount: pastOrders.filter((o) => o.status === "refunded").length,
    },
    orderValue: order.grossRevenue,
    quantity: (order.lineItems ?? []).reduce((s, li) => s + (li.quantity ?? 0), 0),
    storeAverageOrderValue,
    storeAverageQuantity,
    isFirstTimeCustomer: order.isFirstOrder,
    paymentMethod,
    orderedAtHour: order.orderDate ? new Date(order.orderDate).getUTCHours() : undefined,
    productHistory: productHistory.filter((p) =>
      (order.lineItems ?? []).some((li) => li.productId === p.productId)
    ),
    cityHistory,
  });

  // Learned weights: multiply each fired signal's points, then re-cap.
  const weightMap = new Map(weights.map((w) => [w.code, w.weight]));
  let weightedSum = 0;
  const weightedReasons = base.reasons.map((r) => {
    const w = weightMap.get(r.code) ?? 1;
    const points = Math.round(r.points * w * 100) / 100;
    weightedSum += points;
    return { ...r, points };
  });

  // Blocklist hit: +30 points with an explicit reason, never silent.
  const identifiers: { kind: BlocklistKind; value: string }[] = [];
  if (order.customerPhone) identifiers.push({ kind: "phone", value: order.customerPhone });
  if (order.customerEmail) identifiers.push({ kind: "email", value: order.customerEmail });
  if (order.shippingCity && order.shippingPostalCode) {
    identifiers.push({ kind: "address", value: `${order.shippingCity} ${order.shippingPostalCode}` });
  }
  const blocklistHit = identifiers.some((id) =>
    blocklist.some((b) => b.kind === id.kind && b.valueHash === hashIdentifier(id.kind, id.value))
  );
  if (blocklistHit) {
    weightedSum += 30;
    weightedReasons.push({
      code: "blocklist_hit",
      label: "Customer is on your blocklist",
      points: 30,
      detail: "Phone, email or address matched a previously confirmed fake order.",
    });
  }

  const score = Math.min(100, Math.round(weightedSum));
  const band = bandFor(score);
  return {
    score,
    band,
    reasons: weightedReasons,
    autoTag: `risk-${band}` as RiskScore["autoTag"],
    holdFulfillment: band === "high" || band === "critical",
  };
}

async function tagOrderInShopify(
  store: { domain?: string; accessToken?: string | null },
  externalOrderId: string,
  tag: string
): Promise<void> {
  if (!store.domain) return;
  const token = safeDecrypt(store.accessToken);
  if (!token) return;
  const base = adminRestBase(store.domain);
  const getRes = await shopifyFetch(`${base}/orders/${externalOrderId}.json?fields=tags`, token);
  const data = (await getRes.json()) as { order?: { tags?: string } };
  const existing = (data.order?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (existing.includes(tag)) return;
  const tags = [...existing, tag].join(", ");
  await shopifyFetch(`${base}/orders/${externalOrderId}.json`, token, {
    method: "PUT",
    body: JSON.stringify({ order: { id: Number(externalOrderId), tags } }),
  });
}

export async function scoreAndTagOrder(orderId: string, teamId: string): Promise<RiskScore | null> {
  await connectDB();
  const order = await OrderModel.findOne({
    _id: orderId,
    teamId: new mongoose.Types.ObjectId(teamId),
  });
  if (!order) return null;
  const score = await scoreOrderFromDb(order as unknown as OrderDoc);
  order.riskScore = score.score;
  order.riskBand = score.band;
  order.riskReasons = score.reasons;
  order.riskAutoTag = score.autoTag;
  order.riskHoldFulfillment = score.holdFulfillment;
  order.riskScoredAt = new Date();
  await order.save();

  if (score.band === "high" || score.band === "critical") {
    try {
      const store = await StoreModel.findById(order.storeId).select("domain accessToken").lean();
      if (store) await tagOrderInShopify(store, order.externalId, score.autoTag);
    } catch (e) {
      logger.warn("risk tagging failed (non-fatal)", {}, toLogError(e));
    }
  }
  return score;
}

export async function applyReview(
  orderId: string,
  teamId: string,
  verdict: "fake" | "genuine"
): Promise<{ moneySaved: number; feedbackNote: string }> {
  await connectDB();
  const teamOid = new mongoose.Types.ObjectId(teamId);
  const order = await OrderModel.findOne({ _id: orderId, teamId: teamOid });
  if (!order) throw new Error("Order not found");

  // Learned weights from this verdict, starting from stored weights.
  const stored = await RiskSignalWeightModel.find({ teamId: teamOid }).lean();
  const currentWeights: Record<string, number> = {};
  for (const w of stored) currentWeights[w.code] = w.weight;
  const feedback = applyMerchantFeedback({
    score: order.riskScore ?? 0,
    verdict,
    signalCodes: (order.riskReasons ?? []).map((r: { code: string }) => r.code),
    currentWeights,
  });
  for (const [code, weight] of Object.entries(feedback.adjustedWeights)) {
    await RiskSignalWeightModel.findOneAndUpdate(
      { teamId: teamOid, code },
      { $set: { weight } },
      { upsert: true }
    );
  }

  let moneySaved = 0;
  if (verdict === "fake") {
    moneySaved = preventedFakeValue(order.grossRevenue ?? 0);
    const identifiers: { kind: BlocklistKind; value: string }[] = [];
    if (order.customerPhone) identifiers.push({ kind: "phone", value: order.customerPhone });
    if (order.customerEmail) identifiers.push({ kind: "email", value: order.customerEmail });
    if (order.shippingCity && order.shippingPostalCode) {
      identifiers.push({ kind: "address", value: `${order.shippingCity} ${order.shippingPostalCode}` });
    }
    for (const id of identifiers) {
      await BlocklistModel.findOneAndUpdate(
        { teamId: teamOid, kind: id.kind, valueHash: hashIdentifier(id.kind, id.value) },
        { $set: { reason: "Confirmed fake order" } },
        { upsert: true }
      );
    }
  }

  order.riskStatus = verdict;
  order.moneySaved = verdict === "fake" ? moneySaved : 0;
  await order.save();
  return { moneySaved, feedbackNote: feedback.note };
}
