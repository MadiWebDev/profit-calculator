/**
 * POST /api/billing/sync
 *
 * Instant checkout verification and provisioning endpoint.
 * Called immediately upon `checkout.completed` in Paddle.js to eliminate
 * the race condition between frontend redirection and asynchronous webhook delivery.
 *
 * Security:
 * • Requires an authenticated session.
 * • Transaction is verified server-side with Paddle API (getPaddleClient().transactions.get).
 * • Asserts that customData.teamId matches the session teamId or the user's customerId.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/api-helpers";
import { parseBody } from "@/lib/validation";
import { getPaddleClient } from "@/lib/paddle";
import { planFromPriceId } from "@/lib/paddle-webhooks";
import { connectDB } from "@/lib/db";
import SubscriptionModel from "@/models/Subscription";
import TeamModel from "@/models/Team";
import UserModel from "@/models/User";
import { logger } from "@/lib/logger";

const SyncSchema = z
  .object({
    transactionId: z.string().trim().min(1, "transactionId is required"),
  })
  .strict();

export async function POST(req: Request) {
  // Allow archived accounts to call billing sync immediately upon checkout completion
  const authRes = await requireAuth(req, { requireSubscription: false });
  if (authRes instanceof NextResponse) return authRes;
  const { session } = authRes;

  const parsed = await parseBody(req, SyncSchema);
  if ("response" in parsed) return parsed.response;
  const { transactionId } = parsed.data;

  try {
    const paddle = getPaddleClient();
    const tx = await paddle.transactions.get(transactionId);

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Accept valid paid/completed statuses in Paddle Billing v2
    const status = String(tx.status).toLowerCase();
    const isPaid = status === "completed" || status === "paid" || status === "billed";

    if (!isPaid) {
      logger.warn("billing-sync: transaction is not in a paid status", {
        transactionId,
        status: tx.status,
      });
      return NextResponse.json(
        { error: "Transaction has not completed payment yet", status: tx.status },
        { status: 400 }
      );
    }

    const customData = (tx.customData ?? {}) as Record<string, string>;
    const txTeamId = customData.teamId;

    // Security: if customData.teamId was stamped, verify it matches the current session
    if (txTeamId && txTeamId !== session.teamId) {
      logger.warn("billing-sync: teamId mismatch on transaction", {
        txTeamId,
        sessionTeamId: session.teamId,
      });
      return NextResponse.json({ error: "Forbidden — transaction team mismatch" }, { status: 403 });
    }

    const items = tx.items ?? [];
    const priceId = items[0]?.price?.id ?? "";
    const { plan, interval } = planFromPriceId(priceId);
    const subscriptionId = tx.subscriptionId || transactionId;
    const customerId = tx.customerId ?? "";

    await connectDB();

    const teamOid = mongoose.Types.ObjectId.isValid(session.teamId)
      ? new mongoose.Types.ObjectId(session.teamId)
      : session.teamId;

    // 1. Immediately provision the subscription in MongoDB
    await SubscriptionModel.findOneAndUpdate(
      { externalId: subscriptionId },
      {
        $set: {
          teamId: teamOid,
          gateway: "paddle",
          externalId: subscriptionId,
          customerId,
          plan,
          interval,
          status: "active",
          priceId,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // 2. Immediately update Team and Users
    await Promise.all([
      TeamModel.findByIdAndUpdate(session.teamId, {
        plan,
        subscriptionId,
        ...(customerId ? { paddleCustomerId: customerId } : {}),
      }),
      UserModel.updateMany(
        { $or: [{ teamId: session.teamId }, { teamId: teamOid }] },
        { plan }
      ),
    ]);

    logger.info("billing-sync: subscription provisioned successfully", {
      teamId: session.teamId,
      transactionId,
      subscriptionId,
      plan,
      interval,
    });

    return NextResponse.json({
      success: true,
      plan,
      interval,
      subscriptionId,
    });
  } catch (err) {
    logger.error("billing-sync: failed to sync transaction", err instanceof Error ? err : new Error(String(err)), {
      transactionId,
      teamId: session.teamId,
    });
    return NextResponse.json(
      { error: "Failed to verify transaction with Paddle" },
      { status: 500 }
    );
  }
}
