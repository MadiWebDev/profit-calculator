/**
 * Scheduled job implementations — pure server logic, no HTTP.
 * Invoked by /api/cron/* routes (via runCronJob) and the admin jobs UI.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import AdAccountModel from "@/models/AdAccount";
import OrderModel from "@/models/Order";
import AdSpendDailyModel from "@/models/AdSpendDaily";
import ProfitGoalModel from "@/models/ProfitGoal";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { syncShopifyStore } from "@/lib/sync/shopify";
import { syncEtsyStore } from "@/lib/sync/etsy";
import { syncWooCommerceStore } from "@/lib/sync/woocommerce";
import { syncMetaAdSpend } from "@/lib/sync/meta-ads";
import { syncTikTokAdSpend } from "@/lib/sync/tiktok-ads";
import { syncGoogleAdSpend } from "@/lib/sync/google-ads";
import { syncPinterestAdSpend } from "@/lib/sync/pinterest-ads";
import { syncSnapchatAdSpend } from "@/lib/sync/snapchat-ads";
import { checkEntitlement } from "@/lib/entitlements";
import { sendGoalAlertEmail, sendDunningEmail } from "@/lib/email";
import { logger, toLogError } from "@/lib/logger";
import SubscriptionModel from "@/models/Subscription";
import type { CronJobResult } from "@/lib/cron-runner";

const SYNC_PLATFORMS = ["shopify", "etsy", "woocommerce"] as const;

async function syncOneStore(
  store: { _id: mongoose.Types.ObjectId; platform: string; teamId: mongoose.Types.ObjectId }
): Promise<{ ok: boolean; orders: number }> {
  const storeId = store._id.toString();
  const teamId = store.teamId.toString();
  try {
    // Respect plan order caps inside the sync libs; skip teams over their limit
    const ent = await checkEntitlement(teamId, "orders.import", { count: 0 });
    if ("response" in ent) {
      logger.info("cron sync skipped — team over plan limit", { storeId, teamId });
      return { ok: true, orders: 0 };
    }

    let orders = 0;
    if (store.platform === "shopify") {
      const r = await syncShopifyStore(storeId, teamId, {});
      orders = r.synced ?? 0;
    } else if (store.platform === "etsy") {
      const r = await syncEtsyStore(storeId, teamId, {});
      orders = r.synced ?? 0;
    } else if (store.platform === "woocommerce") {
      const r = await syncWooCommerceStore(storeId, teamId, {});
      orders = r.synced ?? 0;
    } else {
      return { ok: true, orders: 0 };
    }
    return { ok: true, orders };
  } catch (err) {
    logger.error("cron store sync failed", toLogError(err), { storeId, teamId });
    return { ok: false, orders: 0 };
  }
}

/**
 * Sync orders for every active, connected store.
 * Per-store failures are isolated — one bad store never aborts the job.
 */
export async function jobSyncStores(): Promise<CronJobResult> {
  await connectDB();
  const stores = await StoreModel.find({
    isActive: true,
    platform: { $in: SYNC_PLATFORMS },
    syncStatus: { $ne: "disconnected" },
  })
    .select("_id platform teamId")
    .lean();

  let succeeded = 0;
  let failed = 0;
  let orders = 0;
  const errors: string[] = [];

  for (const store of stores) {
    const r = await syncOneStore(store);
    if (r.ok) {
      succeeded++;
      orders += r.orders;
    } else {
      failed++;
      errors.push(store._id.toString());
    }
  }

  return {
    status: failed > 0 ? "partial" : "succeeded",
    stats: { stores: stores.length, succeeded, failed, orders },
    ...(failed > 0 ? { error: `${failed} store(s) failed: ${errors.slice(0, 5).join(", ")}` } : {}),
  };
}

/**
 * Refresh ad spend for every active ad account.
 * Dispatches to the platform sync lib; unknown/future platforms are
 * counted as skipped rather than failing the job.
 */
export async function jobRefreshAdSpend(): Promise<CronJobResult> {
  await connectDB();
  const accounts = await AdAccountModel.find({ isActive: true })
    .select("_id platform teamId")
    .lean();

  const syncers: Record<string, (accountId: string, teamId: string, opts: object) => Promise<unknown>> = {
    meta: syncMetaAdSpend,
    tiktok: syncTikTokAdSpend,
    google: syncGoogleAdSpend,
    pinterest: syncPinterestAdSpend,
    snapchat: syncSnapchatAdSpend,
  };

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const acct of accounts) {
    const accountId = acct._id.toString();
    const teamId = acct.teamId.toString();
    const sync = syncers[acct.platform];
    if (!sync) {
      skipped++;
      continue;
    }
    try {
      await sync(accountId, teamId, {});
      succeeded++;
    } catch (err) {
      failed++;
      logger.error("cron ad-spend refresh failed", toLogError(err), { accountId, teamId });
    }
  }

  return {
    status: failed > 0 ? "partial" : "succeeded",
    stats: { accounts: accounts.length, succeeded, failed, skipped },
  };
}

/**
 * Recompute goal progress for the current month and send alert emails.
 * Alerts have a 24h cooldown per goal (lastAlertSentAt).
 */
export async function jobGoalAlerts(): Promise<CronJobResult> {
  await connectDB();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const goals = await ProfitGoalModel.find({ month }).lean();
  let updated = 0;
  let alertsSent = 0;
  let failed = 0;

  for (const goal of goals) {
    try {
      const match: Record<string, unknown> = {
        teamId: goal.teamId,
        orderDate: { $gte: monthStart },
        status: { $ne: "cancelled" },
      };
      if (goal.storeId) match.storeId = goal.storeId;

      const agg = await OrderModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            profit: { $sum: "$netProfit" },
            revenue: { $sum: "$netRevenue" },
          },
        },
      ]);
      const currentProfit = agg[0]?.profit ?? 0;
      const currentRevenue = agg[0]?.revenue ?? 0;
      const progressPercent = goal.targetProfit > 0
        ? Math.min(100, Math.round((currentProfit / goal.targetProfit) * 100))
        : 0;

      await ProfitGoalModel.updateOne(
        { _id: goal._id },
        { $set: { currentProfit, currentRevenue, progressPercent } }
      );
      updated++;

      // Alert: below threshold, alerts enabled, 24h cooldown
      const threshold = goal.alerts?.profitBelowPercent ?? 70;
      const cooldownOk = !goal.lastAlertSentAt ||
        Date.now() - new Date(goal.lastAlertSentAt).getTime() > 24 * 3600 * 1000;
      if (
        goal.alerts?.enabled !== false &&
        goal.targetProfit > 0 &&
        progressPercent < threshold &&
        cooldownOk
      ) {
        const team = await TeamModel.findById(goal.teamId).lean();
        const ownerIds = ((team as unknown as {
          members?: Array<{ userId: mongoose.Types.ObjectId; role: string }>;
        } | null)?.members ?? [])
          .filter((m) => m.role === "owner")
          .map((m) => m.userId);
        const owner = ownerIds.length > 0
          ? await UserModel.findOne({ _id: { $in: ownerIds } })
              .select("email name")
              .lean()
          : null;

        const recipient = owner as { email?: string; name?: string } | null;
        if (recipient?.email) {
          try {
            await sendGoalAlertEmail(
              recipient.email,
              recipient.name ?? "there",
              month,
              currentProfit,
              goal.targetProfit,
              progressPercent
            );
            alertsSent++;
            await ProfitGoalModel.updateOne(
              { _id: goal._id },
              { $set: { lastAlertSentAt: new Date() } }
            );
          } catch (err) {
            logger.error("goal alert email failed", toLogError(err), {
              goalId: goal._id.toString(),
            });
          }
        }
      }
    } catch (err) {
      failed++;
      logger.error("cron goal recompute failed", toLogError(err), {
        goalId: goal._id.toString(),
      });
    }
  }

  return {
    status: failed > 0 ? "partial" : "succeeded",
    stats: { goals: goals.length, updated, alertsSent, failed },
  };
}

/** Registry of runnable jobs — used by cron routes and the admin UI. */
export const CRON_JOBS: Record<
  string,
  { run: () => Promise<CronJobResult>; description: string; schedule: string }
> = {
  "sync-stores": {
    run: jobSyncStores,
    description: "Sync orders for all active stores",
    schedule: "hourly",
  },
  "refresh-ad-spend": {
    run: jobRefreshAdSpend,
    description: "Refresh ad spend for all active ad accounts",
    schedule: "every 6 hours",
  },
  "goal-alerts": {
    run: jobGoalAlerts,
    description: "Recompute goal progress and send threshold alerts",
    schedule: "daily",
  },
  dunning: {
    run: jobDunning,
    description: "Send escalating payment-failure reminders for past-due subscriptions",
    schedule: "daily",
  },
  "anomaly-scan": {
    run: jobAnomalyScan,
    description: "Detect profit/revenue anomalies and notify teams",
    schedule: "daily",
  },
  "backfill-cogs": {
    run: jobBackfillCogs,
    description: "Apply COGS rules to orders missing cost data",
    schedule: "weekly",
  },
};

/**
 * Dunning lifecycle — escalating reminders for past_due subscriptions.
 *
 * Attempt 1 is sent immediately by the Paddle webhook on
 * transaction.payment_failed. This job sends attempt 2 (≥3 days past_due)
 * and attempt 3 (≥7 days past_due). Each attempt has a 24h cooldown via
 * dunningLastSentAt. Stops at 3 attempts — further action is manual.
 */
export async function jobDunning(): Promise<CronJobResult> {
  await connectDB();

  const now = Date.now();
  const subs = await SubscriptionModel.find({
    status: "past_due",
    dunningCount: { $lt: 3 },
  })
    .select("teamId plan dunningCount dunningLastSentAt updatedAt")
    .lean();

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const attempt = (sub.dunningCount ?? 0) + 1;
    const daysPastDue = (now - new Date(sub.updatedAt).getTime()) / (24 * 3600 * 1000);
    const cooldownOk =
      !sub.dunningLastSentAt ||
      now - new Date(sub.dunningLastSentAt).getTime() > 24 * 3600 * 1000;
    // Escalation windows: attempt 2 at ≥3 days, attempt 3 at ≥7 days
    const windowOk = attempt === 1 || (attempt === 2 && daysPastDue >= 3) || (attempt >= 3 && daysPastDue >= 7);

    if (!cooldownOk || !windowOk) continue;

    const owner = await findTeamOwner(sub.teamId);
    if (!owner?.email) {
      failed++;
      continue;
    }

    try {
      await sendDunningEmail(owner.email, owner.name ?? "there", sub.plan, attempt);
      await SubscriptionModel.updateOne(
        { _id: sub._id },
        { $set: { dunningLastSentAt: new Date(), dunningCount: attempt } }
      );
      sent++;
    } catch (err) {
      failed++;
      logger.error(
        "dunning: email failed",
        err instanceof Error ? err : new Error("unknown"),
        { subscriptionId: String(sub._id), attempt }
      );
    }
  }

  return {
    status: failed > 0 ? "partial" : "succeeded",
    stats: { pastDue: subs.length, sent, failed },
  };
}

async function findTeamOwner(
  teamId: unknown
): Promise<{ email?: string; name?: string } | null> {
  const team = await TeamModel.findById(teamId).lean();
  const members = (team as unknown as {
    members?: Array<{ userId: mongoose.Types.ObjectId; role: string }>;
  } | null)?.members ?? [];
  const ownerIds = members.filter((m) => m.role === "owner").map((m) => m.userId);
  if (ownerIds.length === 0) return null;
  return UserModel.findOne({ _id: { $in: ownerIds } }).select("email name").lean();
}

/**
 * Anomaly scan — daily detection of profit/revenue anomalies per team.
 *
 * For every team with orders in the last 90 days: build the daily net-profit
 * series, run z-score detection, and for anomalies in the last 7 days that
 * haven't been notified yet, create an in-app Notification and fan out the
 * `anomaly.detected` outbound webhook. Notification dedup: one notification
 * per (team, metric, date) — the metadata key prevents repeats.
 */
export async function jobAnomalyScan(): Promise<CronJobResult> {
  await connectDB();
  const { detectAnomalies } = await import("@/lib/analytics");
  const { calcOrderProfit } = await import("@/lib/profit-engine");
  const { emitOutboundWebhook } = await import("@/lib/outbound-webhooks");
  const NotificationModel = (await import("@/models/Notification")).default;
  type DailyPoint = { date: string; value: number };

  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const teamIds = await OrderModel.distinct("teamId", {
    orderDate: { $gte: since },
  });

  let teamsScanned = 0;
  let anomaliesFound = 0;
  let notified = 0;

  for (const teamId of teamIds) {
    teamsScanned++;
    const [orders, adSpend] = await Promise.all([
      OrderModel.find({ teamId, orderDate: { $gte: since }, status: { $ne: "cancelled" } })
        .select("orderDate grossRevenue refundAmount chargebackAmount totalCogs shippingCost transactionFees otherCosts")
        .lean(),
      AdSpendDailyModel.find({ teamId, date: { $gte: since } }).select("date spend").lean(),
    ]);

    const byDay = new Map<string, { net: number; spend: number }>();
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    for (let i = 0; i < 90; i++) {
      const d = new Date(Date.now() - (89 - i) * 24 * 3600 * 1000);
      byDay.set(dayKey(d), { net: 0, spend: 0 });
    }
    for (const o of orders) {
      const t = o as {
        orderDate: Date; grossRevenue?: number; refundAmount?: number; chargebackAmount?: number;
        totalCogs?: number; shippingCost?: number; transactionFees?: number; otherCosts?: number;
      };
      const bucket = byDay.get(dayKey(new Date(t.orderDate)));
      if (!bucket) continue;
      const profit = calcOrderProfit({
        grossRevenue: t.grossRevenue ?? 0,
        discounts: 0,
        shippingRevenue: 0,
        shippingCost: t.shippingCost ?? 0,
        totalCogs: t.totalCogs ?? 0,
        transactionFees: t.transactionFees ?? 0,
        taxes: 0,
        refundAmount: t.refundAmount ?? 0,
        chargebackAmount: t.chargebackAmount ?? 0,
        adSpendAllocated: 0,
        otherCosts: t.otherCosts ?? 0,
      });
      bucket.net += profit.netProfit;
    }
    for (const a of adSpend) {
      const t = a as { date: Date; spend?: number };
      const bucket = byDay.get(dayKey(new Date(t.date)));
      if (bucket) bucket.spend += t.spend ?? 0;
    }

    const series: DailyPoint[] = [...byDay.entries()].map(([date, b]) => ({
      date,
      value: Math.round((b.net - b.spend) * 100) / 100,
    }));

    const anomalies = detectAnomalies(series);
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const recent = anomalies.filter((a) => a.date >= cutoff);
    anomaliesFound += recent.length;

    for (const a of recent) {
      const dedupeKey = `anomaly:netProfit:${a.date}`;
      const existing = await NotificationModel.findOne({
        teamId,
        type: "anomaly",
        "metadata.dedupeKey": dedupeKey,
      })
        .select("_id")
        .lean();
      if (existing) continue;

      const title = a.direction === "spike"
        ? `Profit spike detected on ${a.date}`
        : `Profit drop detected on ${a.date}`;
      const body =
        `Daily net profit was $${a.value.toLocaleString()} vs an expected $${a.expected.toLocaleString()} ` +
        `(z-score ${a.zScore}). Review orders, refunds and ad spend for ${a.date}.`;

      await NotificationModel.create({
        teamId,
        type: "anomaly",
        title,
        body,
        severity: a.severity === "critical" ? "error" : "warning",
        read: false,
        actionUrl: "/dashboard/pnl",
        actionLabel: "View P&L",
        metadata: { dedupeKey, date: a.date, zScore: a.zScore, direction: a.direction },
        sentVia: ["in_app"],
      });
      notified++;

      await emitOutboundWebhook(teamId, "anomaly.detected", {
        metric: "netProfit",
        date: a.date,
        value: a.value,
        expected: a.expected,
        zScore: a.zScore,
        direction: a.direction,
        severity: a.severity,
      });
    }
  }

  return {
    status: "succeeded",
    stats: { teamsScanned, anomaliesFound, notified },
  };
}

/**
 * COGS backfill — apply active CogsRules to orders missing cost data.
 *
 * Matches orders with totalCogs == 0 against the team's COGS rules by
 * external product id (line-item level), filling cogs/totalCogs from the
 * rule. Limited to 5,000 orders per run; idempotent (skips orders that
 * already have COGS).
 */
export async function jobBackfillCogs(): Promise<CronJobResult> {
  await connectDB();
  const CogsRuleModel = (await import("@/models/CogsRule")).default;

  const teams = await CogsRuleModel.distinct("teamId", { applyToNewOrders: true });
  let ordersUpdated = 0;
  let teamsProcessed = 0;

  for (const teamId of teams) {
    teamsProcessed++;
    const rules = await CogsRuleModel.find({ teamId, applyToNewOrders: true }).lean();
    const ruleByProduct = new Map<string, number>();
    for (const r of rules) {
      if (r.productId && !ruleByProduct.has(r.productId)) {
        ruleByProduct.set(r.productId, r.cogs ?? 0);
      }
    }
    if (ruleByProduct.size === 0) continue;

    const orders = await OrderModel.find({
      teamId,
      $or: [{ totalCogs: 0 }, { totalCogs: { $exists: false } }],
    })
      .select("lineItems totalCogs")
      .limit(5000)
      .lean();

    const bulk = [];
    for (const o of orders) {
      const items = (o as { lineItems?: Array<{ productId?: string; quantity?: number; cogs?: number }> }).lineItems ?? [];
      let total = 0;
      let matched = false;
      for (const li of items) {
        const ruleCogs = li.productId ? ruleByProduct.get(li.productId) : undefined;
        if (ruleCogs !== undefined && ruleCogs > 0) {
          matched = true;
          total += ruleCogs * (li.quantity ?? 1);
        } else {
          total += (li.cogs ?? 0) * (li.quantity ?? 1);
        }
      }
      if (matched && total > 0) {
        bulk.push({
          updateOne: {
            filter: { _id: o._id },
            update: { $set: { totalCogs: Math.round(total * 100) / 100, cogsBackfilled: true } },
          },
        });
      }
    }
    if (bulk.length > 0) {
      const res = await OrderModel.bulkWrite(bulk, { ordered: false });
      ordersUpdated += res.modifiedCount ?? 0;
    }
  }

  return {
    status: "succeeded",
    stats: { teamsProcessed, ordersUpdated },
  };
}
