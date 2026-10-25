import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Phase 6: a courier the merchant uses. API keys are AES-encrypted
 * (never returned by any API — routes expose only hasApiKey). The
 * only adapter shipped is "generic" (status normalisation + CSV
 * fallback); named courier adapters are added when the merchant
 * supplies their courier list (see FINAL_REPORT).
 */
export interface ICourier extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  name: string;
  adapter: string;
  apiKey?: string | null;
  apiBaseUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourierSchema = new Schema<ICourier>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store" },
    name: { type: String, required: true, trim: true },
    adapter: { type: String, default: "generic" },
    apiKey: { type: String, default: null },
    apiBaseUrl: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CourierSchema.index({ teamId: 1, name: 1 }, { unique: true });

export default models.Courier || model<ICourier>("Courier", CourierSchema);
