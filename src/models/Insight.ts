import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Cached AI insights per team + period (Phase 9 — AI insights v2).
 * Only aggregated numbers are ever sent to the LLM — never PII.
 */
export interface IInsightItem {
  type: "positive" | "warning" | "info";
  title: string;
  body: string;
}

export interface IInsight extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  period: string; // e.g. "2026-10" or "2026-W42" — cache key component
  kind: "periodic" | "waterfall" | "ask";
  items: IInsightItem[];
  /** Aggregated inputs the insight was generated from (no PII). */
  inputs: Record<string, number>;
  modelName: string;
  tokensUsed?: number;
  createdAt: Date;
  updatedAt: Date;
}

const InsightItemSchema = new Schema<IInsightItem>(
  {
    type: { type: String, enum: ["positive", "warning", "info"], required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false }
);

const InsightSchema = new Schema<IInsight>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    period: { type: String, required: true },
    kind: { type: String, enum: ["periodic", "weekly", "daily", "waterfall", "ask"], default: "periodic" },
    items: [InsightItemSchema],
    inputs: { type: Map, of: Number, default: {} },
    modelName: { type: String, default: "gpt-4o-mini" },
    tokensUsed: Number,
  },
  { timestamps: true }
);

InsightSchema.index({ teamId: 1, period: 1, kind: 1 }, { unique: true });
// Auto-expire cached insights after 90 days
InsightSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default models.Insight || model<IInsight>("Insight", InsightSchema);
