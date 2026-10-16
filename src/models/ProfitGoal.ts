import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IAlertConfig {
  enabled: boolean;
  email: boolean;
  slack: boolean;
  slackWebhookUrl?: string;
  // Thresholds
  profitBelowPercent?: number;  // alert if on-track profit < X% of goal
  marginBelowPercent?: number;  // alert if any product margin drops below X%
  adSpendOverPercent?: number;  // alert if ad spend > X% of revenue
}

export interface IProfitGoal extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId; // null = all stores
  month: string;   // "YYYY-MM"
  targetProfit: number;
  targetRevenue?: number;
  targetMargin?: number;
  currency: string;
  alerts: IAlertConfig;
  // Tracked progress (updated by cron)
  currentProfit: number;
  currentRevenue: number;
  progressPercent: number;
  lastAlertSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AlertConfigSchema = new Schema<IAlertConfig>({
  enabled: { type: Boolean, default: true },
  email: { type: Boolean, default: true },
  slack: { type: Boolean, default: false },
  slackWebhookUrl: String,
  profitBelowPercent: { type: Number, default: 70 },
  marginBelowPercent: { type: Number, default: 10 },
  adSpendOverPercent: { type: Number, default: 40 },
});

const ProfitGoalSchema = new Schema<IProfitGoal>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store" },
    month: { type: String, required: true }, // "2026-09"
    targetProfit: { type: Number, required: true },
    targetRevenue: Number,
    targetMargin: Number,
    currency: { type: String, default: "USD" },
    alerts: { type: AlertConfigSchema, default: () => ({}) },
    currentProfit: { type: Number, default: 0 },
    currentRevenue: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 },
    lastAlertSentAt: Date,
  },
  { timestamps: true }
);

ProfitGoalSchema.index({ teamId: 1, month: 1 }, { unique: true });

export default models.ProfitGoal || model<IProfitGoal>("ProfitGoal", ProfitGoalSchema);
