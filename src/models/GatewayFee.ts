import mongoose, { Schema, Document, model, models } from "mongoose";

/** Payment-gateway fee schedule, per gateway and per currency. */
export interface IGatewayFee extends Document {
  teamId: mongoose.Types.ObjectId;
  gateway: string;
  currency: string;
  percent: number;
  fixed: number;
  codHandling: string;
  payoutDelayDays: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GatewayFeeSchema = new Schema<IGatewayFee>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    gateway: { type: String, required: true, trim: true, maxlength: 120 },
    currency: { type: String, default: "USD" },
    percent: { type: Number, required: true, min: 0, max: 100 },
    fixed: { type: Number, required: true, min: 0 },
    codHandling: { type: String, default: "collect_on_delivery", maxlength: 120 },
    payoutDelayDays: { type: Number, default: 0, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

GatewayFeeSchema.index({ teamId: 1, gateway: 1, currency: 1 });

export default models.GatewayFee || model<IGatewayFee>("GatewayFee", GatewayFeeSchema);
