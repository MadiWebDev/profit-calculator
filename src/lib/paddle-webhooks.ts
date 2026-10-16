/**
 * Paddle webhook event processing — extracted from the route for testability.
 *
 * Delivery guarantees handled here:
 * - Deduplication: the route upserts a WebhookEvent by event_id first; this
 *   module never sees the same event twice.
 * - Ordering: subscription writes carry the event's occurred_at and are only
 *   applied when newer than the subscription's lastEventAt. A stale
 *   subscription.updated arriving after subscription.canceled can never
 *   resurrect the subscription.
 * - Dunning: transaction.payment_failed marks past_due and sends a dunning
 *   email (24h cooldown, counted per episode).
 */
import type {
  SubscriptionCreatedEvent,
  SubscriptionUpdatedEvent,
  SubscriptionCanceledEvent,
  SubscriptionPausedEvent,
  SubscriptionResumedEvent,
  SubscriptionActivatedEvent,
  TransactionCompletedEvent,
  TransactionPaymentFailedEvent,
  CustomerCreatedEvent,
  CustomerUpdatedEvent,
} from "@paddle/paddle-node-sdk";
import mongoose from "mongoose";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { getAllPriceIds } from "@/lib/billing";
import type { PlanKey, BillingInterval } from "@/lib/billing";
import { sendDunningEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

// ── Price-ID → plan + interval reverse lookup ─────────────────────────────────

interface PlanEntry {
  plan: PlanKey;
  interval: BillingInterval;
}

function buildPriceMap(): Record<string, PlanEntry> {
  const allIds = getAllPriceIds();
  const map: Record<string, PlanEntry> = {};
  for (const [key, priceId] of Object.entries(allIds)) {
    if (!priceId) continue;
    const [plan, interval] = key.split("_") as [PlanKey, BillingInterval];
    map[priceId] = { plan, interval };
  }
  return map;
}

export function planFromPriceId(priceId: string): PlanEntry {
  const map = buildPriceMap();
  if (map[priceId]) return map[priceId];
  const id = priceId.toLowerCase();
  const plan: PlanKey =
    id.includes("pro") ? "pro" : id.includes("growth") ? "growth" : "starter";
  const interval: BillingInterval =
    id.includes("semiannual") ? "semiannual" :
    id.includes("annual")     ? "annual"     :
    id.includes("quarterly")  ? "quarterly"  : "monthly";
  return { plan, interval };
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

/**
 * Ordering guard: only apply the write when the event is newer than the
 * last event applied to this subscription. Returns true when applied.
 */
export async function applyIfNewer(
  externalId: string,
  occurredAt: Date | undefined,
  apply: () => Promise<unknown>
): Promise<boolean> {
  if (!occurredAt) {
    await apply();
    return true;
  }
  const sub = await SubscriptionModel.findOne({ externalId }).select("lastEventAt").lean();
  if (sub?.lastEventAt && new Date(sub.lastEventAt).getTime() >= occurredAt.getTime()) {
    logger.info("paddle webhook: stale event skipped", { externalId, occurredAt });
    return false;
  }
  await apply();
  await SubscriptionModel.updateOne({ externalId }, { $set: { lastEventAt: occurredAt } });
  return true;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleSubscriptionUpsert(
  data: SubscriptionCreatedEvent["data"] |
        SubscriptionUpdatedEvent["data"] |
        SubscriptionActivatedEvent["data"],
  occurredAt?: Date
): Promise<void> {
  const customData = (data.customData ?? {}) as Record<string, string>;
  const teamId     = customData.teamId;

  if (!teamId) {
    logger.warn("paddle webhook: subscription event missing teamId in custom_data — skipping");
    return;
  }

  const items   = data.items ?? [];
  const priceId = items[0]?.price?.id ?? "";
  const { plan, interval } = planFromPriceId(priceId);
  const billingPeriod = data.currentBillingPeriod;

  const rawStatus = String(data.status ?? "active");
  const statusMap: Record<string, string> = {
    active:    "active",
    trialing:  "trialing",
    past_due:  "past_due",
    paused:    "paused",
    canceled:  "cancelled",
    cancelled: "cancelled",
  };
  const status = statusMap[rawStatus] ?? rawStatus;

  const scheduledChangeAction = data.scheduledChange?.action ? String(data.scheduledChange.action) : null;
  const scheduledChangeAt     = data.scheduledChange?.effectiveAt ? toDate(data.scheduledChange.effectiveAt) : null;

  await applyIfNewer(data.id, occurredAt, async () => {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: data.id },
      {
        $set: {
          teamId,
          gateway:            "paddle",
          externalId:         data.id,
          customerId:         data.customerId,
          plan,
          interval,
          status,
          priceId,
          currentPeriodStart: billingPeriod?.startsAt ? toDate(billingPeriod.startsAt) : new Date(),
          currentPeriodEnd:   billingPeriod?.endsAt   ? toDate(billingPeriod.endsAt)   : new Date(),
          cancelAtPeriodEnd:  scheduledChangeAction === "cancel",
          scheduledChangeAction,
          scheduledChangeAt,
          // A fresh upsert resets the dunning episode
          ...(status !== "past_due" ? { dunningCount: 0 } : {}),
        },
      },
      { upsert: true, new: true }
    );

    await Promise.all([
      TeamModel.findByIdAndUpdate(teamId, {
        plan,
        subscriptionId: data.id,
        paddleCustomerId: data.customerId,
      }),
      UserModel.updateMany({ teamId }, { plan }),
    ]);
  });

  logger.info("paddle webhook: subscription upserted", {
    id: data.id, teamId, plan, interval, status,
  });
}

export async function handleSubscriptionCanceled(
  data: SubscriptionCanceledEvent["data"],
  occurredAt?: Date
): Promise<void> {
  const existing = await SubscriptionModel.findOne({ externalId: data.id }).select("teamId").lean();
  if (!existing) {
    logger.warn("paddle webhook: subscription.canceled — no matching sub", { id: data.id });
    return;
  }
  const applied = await applyIfNewer(data.id, occurredAt, async () => {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: data.id },
      { $set: { status: "cancelled", cancelledAt: new Date(), cancelAtPeriodEnd: false, dunningCount: 0 } }
    );
  });
  if (!applied) return;
  // Downgrade the team to free immediately — the "instant cancel" guarantee
  await Promise.all([
    TeamModel.findByIdAndUpdate(existing.teamId, { plan: "free" }),
    UserModel.updateMany({ teamId: existing.teamId }, { plan: "free" }),
  ]);
  logger.info("paddle webhook: subscription canceled", { id: data.id });
}

export async function handleSubscriptionPaused(
  data: SubscriptionPausedEvent["data"],
  occurredAt?: Date
): Promise<void> {
  await applyIfNewer(data.id, occurredAt, async () => {
    await SubscriptionModel.findOneAndUpdate({ externalId: data.id }, { $set: { status: "paused" } });
  });
  logger.info("paddle webhook: subscription paused", { id: data.id });
}

export async function handleSubscriptionResumed(
  data: SubscriptionResumedEvent["data"],
  occurredAt?: Date
): Promise<void> {
  const applied = await applyIfNewer(data.id, occurredAt, async () => {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: data.id },
      { $set: { status: "active", dunningCount: 0 } }
    );
  });
  if (applied) {
    const sub = await SubscriptionModel.findOne({ externalId: data.id }).select("teamId plan").lean();
    if (sub?.teamId && sub.plan) {
      await Promise.all([
        TeamModel.findByIdAndUpdate(sub.teamId, { plan: sub.plan }),
        UserModel.updateMany({ teamId: sub.teamId }, { plan: sub.plan }),
      ]);
    }
    logger.info("paddle webhook: subscription resumed", { id: data.id });
  }
}

export async function handleTransactionCompleted(
  data: TransactionCompletedEvent["data"],
  occurredAt?: Date
): Promise<void> {
  const subscriptionId = data.subscriptionId;
  const customData     = (data.customData ?? {}) as Record<string, string>;
  const teamId         = customData.teamId;

  if (!subscriptionId || !teamId) return;

  const applied = await applyIfNewer(subscriptionId, occurredAt, async () => {
    const existing = await SubscriptionModel.findOne({ externalId: subscriptionId });
    // Only provision when no record exists — never overwrite a more
    // complete subscription.created payload with a thinner transaction one.
    if (existing) return;

    const items   = data.items ?? [];
    const priceId = items[0]?.price?.id ?? "";
    const { plan, interval } = planFromPriceId(priceId);

    await SubscriptionModel.findOneAndUpdate(
      { externalId: subscriptionId },
      {
        $set: {
          teamId,
          gateway:    "paddle",
          externalId: subscriptionId,
          customerId: data.customerId ?? "",
          plan,
          interval,
          status:     "active",
          priceId,
        },
      },
      { upsert: true, new: true }
    );
    await Promise.all([
      TeamModel.findByIdAndUpdate(teamId, { plan, subscriptionId }),
      UserModel.updateMany({ teamId }, { plan }),
    ]);
  });

  logger.info("paddle webhook: transaction.completed", {
    subscriptionId, teamId, applied,
  });
}

export async function handlePaymentFailed(
  data: TransactionPaymentFailedEvent["data"],
  occurredAt?: Date
): Promise<void> {
  const subscriptionId = data.subscriptionId;
  if (!subscriptionId) return;

  const applied = await applyIfNewer(subscriptionId, occurredAt, async () => {
    await SubscriptionModel.findOneAndUpdate(
      { externalId: subscriptionId },
      { $set: { status: "past_due" } }
    );
  });
  if (!applied) return;
  logger.info("paddle webhook: payment failed — marked past_due", { subscriptionId });

  // Dunning email (24h cooldown, counted per episode)
  const sub = await SubscriptionModel.findOne({ externalId: subscriptionId }).lean();
  if (!sub) return;
  const cooldownOk = !sub.dunningLastSentAt ||
    Date.now() - new Date(sub.dunningLastSentAt).getTime() > 24 * 3600 * 1000;
  if (!cooldownOk) return;

  const teamId = sub.teamId;
  const owner = await UserModel.findOne({
    _id: { $in: await ownerIdsForTeam(teamId) },
  }).select("email name").lean();

  const attempt = (sub.dunningCount ?? 0) + 1;
  const recipient = owner as { email?: string; name?: string } | null;
  if (recipient?.email) {
    try {
      await sendDunningEmail(recipient.email, recipient.name ?? "there", sub.plan, attempt);
      await SubscriptionModel.updateOne(
        { externalId: subscriptionId },
        { $set: { dunningLastSentAt: new Date(), dunningCount: attempt } }
      );
      logger.info("paddle webhook: dunning email sent", { subscriptionId, attempt });
    } catch (err) {
      logger.error(
        "paddle webhook: dunning email failed",
        err instanceof Error ? err : new Error("unknown"),
        { subscriptionId }
      );
    }
  }
}

async function ownerIdsForTeam(teamId: unknown): Promise<mongoose.Types.ObjectId[]> {
  const team = await TeamModel.findById(teamId).lean();
  const members = (team as unknown as {
    members?: Array<{ userId: mongoose.Types.ObjectId; role: string }>;
  } | null)?.members ?? [];
  return members.filter((m) => m.role === "owner").map((m) => m.userId);
}

export async function handleCustomerUpsert(
  data: CustomerCreatedEvent["data"] | CustomerUpdatedEvent["data"]
): Promise<void> {
  const email  = data.email;
  const custId = data.id;
  if (!email || !custId) return;
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select("teamId").lean();
  if (user?.teamId) {
    await TeamModel.findByIdAndUpdate(user.teamId, { paddleCustomerId: custId });
    logger.info("paddle webhook: stored paddleCustomerId on team", { custId });
  }
}
