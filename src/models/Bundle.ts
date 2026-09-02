import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IBundleComponent {
  productId: string;
  variantId?: string;
  name: string;
  cogs: number;
  quantity: number;
}

export interface IBundle extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;  // optional — bundles can be team-level
  name: string;
  sku?: string;
  sellingPrice: number;
  components: IBundleComponent[];
  totalCogs: number;
  grossMargin: number;  // %
  netMarginEstimate: number; // after typical fees
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BundleComponentSchema = new Schema<IBundleComponent>({
  productId: { type: String, required: true },
  variantId: String,
  name:      { type: String, required: true },
  cogs:      { type: Number, required: true, default: 0 },
  quantity:  { type: Number, required: true, default: 1 },
});

const BundleSchema = new Schema<IBundle>(
  {
    teamId:   { type: Schema.Types.ObjectId, ref: "Team",  required: true, index: true },
    storeId:  { type: Schema.Types.ObjectId, ref: "Store" },  // optional
    name:     { type: String, required: true, trim: true },
    sku:      String,
    sellingPrice:      { type: Number, default: 0 },
    components:        [BundleComponentSchema],
    totalCogs:         { type: Number, default: 0 },
    grossMargin:       { type: Number, default: 0 },
    netMarginEstimate: { type: Number, default: 0 },
    currency:  { type: String, default: "USD" },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default models.Bundle || model<IBundle>("Bundle", BundleSchema);
