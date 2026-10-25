import mongoose, { Schema, Document, model, models } from "mongoose";

/** Per-order / per-percent fee rule (gateway, COD, packaging, handling,
 *  subscription share, returns processing, chargeback, custom). Rules
 *  are effective-dated: a rule applies only to orders on/after
 *  effectiveFrom and before effectiveTo (null = open-ended). */
export interface IOtherFeeRule extends Document {
  teamId: mongoose.Types.ObjectId;
  name: string;
  feeType: string;
  kind: "percent" | "fixed_per_order";
  value: number;
  country?: string;
  productTag?: string;
  paymentMethod?: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OtherFeeRuleSchema = new Schema<IOtherFeeRule>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    feeType: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: ["percent", "fixed_per_order"], required: true },
    value: { type: Number, required: true, min: 0 },
    country: String,
    productTag: String,
    paymentMethod: String,
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default models.OtherFeeRule || model<IOtherFeeRule>("OtherFeeRule", OtherFeeRuleSchema);
