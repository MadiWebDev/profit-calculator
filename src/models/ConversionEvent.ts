import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Conversion funnel events (view / add_to_cart / checkout / purchase).
 * Purchase events are NOT revenue — revenue comes from orders; these
 * events only supply the visitor-side denominators for conversion rates
 * and profit-per-visitor. No customer PII is stored here (anonymous
 * session key only), so the funnel can be shown without exposing
 * individual shoppers. Until a store sends events (ShopifyQL import or
 * the pixel app extension — see docs/MANUAL_STEPS.md), the Conversion
 * page shows an explicit "enable conversion tracking" state.
 */
export type ConversionStep = "view" | "add_to_cart" | "checkout" | "purchase";

export interface IConversionEvent extends Document {
  teamId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  productId?: string;
  productName?: string;
  source?: string;
  sessionKey: string;
  step: ConversionStep;
  occurredAt: Date;
  createdAt: Date;
}

const ConversionEventSchema = new Schema<IConversionEvent>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    productId: String,
    productName: String,
    source: String,
    sessionKey: { type: String, required: true },
    step: { type: String, enum: ["view", "add_to_cart", "checkout", "purchase"], required: true },
    occurredAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

ConversionEventSchema.index({ teamId: 1, productId: 1, step: 1 });
ConversionEventSchema.index({ teamId: 1, source: 1, step: 1 });

export default models.ConversionEvent || model<IConversionEvent>("ConversionEvent", ConversionEventSchema);
