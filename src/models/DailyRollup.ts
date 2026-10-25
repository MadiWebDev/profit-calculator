import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Phase 8: pre-computed daily profit rollup, one row per team per UTC
 * day. Built by the rollup-daily cron job from live orders (see
 * lib/rollups.ts); live orders remain the source of truth.
 */
export interface IDailyRollup extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  date: Date;
  grossRevenue: number;
  netProfit: number;
  refunds: number;
  totalCogs: number;
  shippingCost: number;
  transactionFees: number;
  orderCount: number;
  cancelledOrderCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRollupSchema = new Schema<IDailyRollup>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    date: { type: Date, required: true },
    grossRevenue: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    refunds: { type: Number, default: 0 },
    totalCogs: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    transactionFees: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    cancelledOrderCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DailyRollupSchema.index({ teamId: 1, date: 1 }, { unique: true });

export default models.DailyRollup || model<IDailyRollup>("DailyRollup", DailyRollupSchema);
