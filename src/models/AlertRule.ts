import mongoose, { Schema, Document, model, models } from "mongoose";

import type { AlertMetric, AlertOperator } from "@/lib/alerts";

/**
 * User-defined guardrail rule (advanced alerts slice).
 * Evaluated by the `guardrail-alerts` cron job (and on demand by the
 * alerts API/page) via the pure evaluator in `@/lib/alerts`.
 * A triggered rule creates one in-app Notification per team per rule
 * per 24h at most — see `lastTriggeredAt` handling in
 * `@/lib/alerts-server`.
 */
export interface IAlertRule extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  windowDays: number;
  enabled: boolean;
  lastTriggeredAt?: Date;
  lastEvaluatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AlertRuleSchema = new Schema<IAlertRule>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, maxlength: 120 },
    metric: {
      type: String,
      enum: ["profit_margin", "refund_rate", "rto_rate", "avg_order_profit"],
      required: true,
    },
    operator: { type: String, enum: ["below", "above"], required: true },
    threshold: { type: Number, required: true },
    windowDays: { type: Number, required: true, min: 1, max: 365 },
    enabled: { type: Boolean, default: true },
    lastTriggeredAt: Date,
    lastEvaluatedAt: Date,
  },
  { timestamps: true }
);

AlertRuleSchema.index({ teamId: 1, enabled: 1, createdAt: -1 });

export default models.AlertRule || model<IAlertRule>("AlertRule", AlertRuleSchema);
