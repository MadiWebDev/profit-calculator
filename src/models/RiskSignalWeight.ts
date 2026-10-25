import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Learned signal weights (Phase 4 feedback loop). When a merchant marks
 * an order fake/genuine, the weights of the signals that fired move
 * (bounded [0.5, 2.0] by the pure engine's applyMerchantFeedback).
 * The scorer multiplies each signal's points by its weight before
 * capping at 100, so the engine genuinely learns from verdicts.
 */
export interface IRiskSignalWeight extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  code: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

const RiskSignalWeightSchema = new Schema<IRiskSignalWeight>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    code: { type: String, required: true },
    weight: { type: Number, required: true, min: 0.5, max: 2 },
  },
  { timestamps: true }
);

RiskSignalWeightSchema.index({ teamId: 1, code: 1 }, { unique: true });

export default models.RiskSignalWeight || model<IRiskSignalWeight>("RiskSignalWeight", RiskSignalWeightSchema);
