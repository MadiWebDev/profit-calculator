/**
 * Server bridge for guardrail alerts (thin wrapper over the pure
 * evaluator in `@/lib/alerts`, per decision D6).
 *
 * - `evaluateTeamAlerts` loads a team's enabled rules plus the orders
 *   and shipments they need, and returns one evaluation per rule.
 * - `runAlertRulesForTeam` additionally persists delivery: a triggered
 *   rule creates one in-app Notification, at most once per rule per
 *   24h (cooldown via `lastTriggeredAt`), so a daily cron never spams
 *   the bell for a breach that stays breached.
 * - Notification types reuse the existing enum: margin breaches map to
 *   "margin_drop", refund breaches to "refund_spike", everything else
 *   to "anomaly". Critical severity maps to "error", warning to
 *   "warning".
 */
import { connectDB } from "@/lib/db";
import AlertRuleModel from "@/models/AlertRule";
import OrderModel from "@/models/Order";
import ShipmentModel from "@/models/Shipment";
import NotificationModel, { type NotificationType } from "@/models/Notification";
import {
  evaluateAlerts,
  type AlertEvaluation,
  type AlertMetric,
  type AlertOperator,
} from "@/lib/alerts";

const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function notificationTypeFor(metric: AlertMetric): NotificationType {
  if (metric === "profit_margin" || metric === "avg_order_profit") return "margin_drop";
  if (metric === "refund_rate") return "refund_spike";
  return "anomaly";
}

export async function evaluateTeamAlerts(
  teamId: string,
  now = new Date()
): Promise<{ rules: { id: string; name: string; metric: AlertMetric; operator: AlertOperator; threshold: number; windowDays: number; enabled: boolean; lastTriggeredAt: string | null }[]; evaluations: AlertEvaluation[] }> {
  await connectDB();

  const rules = await AlertRuleModel.find({ teamId }).sort({ createdAt: -1 }).lean();
  if (rules.length === 0) return { rules: [], evaluations: [] };

  const maxWindow = Math.max(...rules.map((r) => r.windowDays));
  const since = new Date(now.getTime() - maxWindow * 24 * 60 * 60 * 1000);

  const orders = await OrderModel.find({ teamId, orderDate: { $gte: since, $lte: now } })
    .select("orderDate grossRevenue netProfit refundAmount rtoLoss status")
    .lean();
  const shipments = await ShipmentModel.find({ teamId, bookedAt: { $gte: since, $lte: now } })
    .select("status bookedAt createdAt")
    .lean();

  const evaluations = evaluateAlerts(
    rules.filter((r) => r.enabled).map((r) => ({
      id: r._id.toString(),
      metric: r.metric,
      operator: r.operator,
      threshold: r.threshold,
      windowDays: r.windowDays,
    })),
    orders.map((o) => ({
      orderDate: o.orderDate,
      grossRevenue: o.grossRevenue ?? 0,
      netProfit: o.netProfit ?? 0,
      refundAmount: o.refundAmount ?? 0,
      rtoLoss: o.rtoLoss ?? 0,
      status: o.status,
    })),
    shipments.map((s) => ({
      status: s.status,
      bookedAt: s.bookedAt,
      createdAt: s.createdAt,
    })),
    now
  );

  return {
    rules: rules.map((r) => ({
      id: r._id.toString(),
      name: r.name,
      metric: r.metric,
      operator: r.operator,
      threshold: r.threshold,
      windowDays: r.windowDays,
      enabled: r.enabled,
      lastTriggeredAt: r.lastTriggeredAt ? r.lastTriggeredAt.toISOString() : null,
    })),
    evaluations,
  };
}

export async function runAlertRulesForTeam(
  teamId: string,
  now = new Date()
): Promise<{ evaluated: number; triggered: number; notified: number }> {
  await connectDB();

  const { evaluations } = await evaluateTeamAlerts(teamId, now);
  let triggered = 0;
  let notified = 0;

  for (const ev of evaluations) {
    const rule = await AlertRuleModel.findOne({ _id: ev.ruleId, teamId });
    if (!rule) continue;
    rule.lastEvaluatedAt = now;
    await rule.save();

    if (!ev.triggered || !ev.severity) continue;
    triggered += 1;

    const cooledDown =
      !rule.lastTriggeredAt ||
      now.getTime() - rule.lastTriggeredAt.getTime() >= NOTIFICATION_COOLDOWN_MS;
    if (!cooledDown) continue;

    await NotificationModel.create({
      teamId,
      type: notificationTypeFor(ev.metric),
      title: `Guardrail breached: ${ev.message}`,
      body: ev.message,
      severity: ev.severity === "critical" ? "error" : "warning",
      read: false,
      actionUrl: "/dashboard/alerts",
      actionLabel: "View guardrails",
      metadata: { ruleId: ev.ruleId, metric: ev.metric, value: ev.value, threshold: ev.threshold },
      sentVia: ["in_app"],
    });
    rule.lastTriggeredAt = now;
    await rule.save();
    notified += 1;
  }

  return { evaluated: evaluations.length, triggered, notified };
}
