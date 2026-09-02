import mongoose, { Schema, Document, model, models } from "mongoose";

export interface ICogsHistory {
  cogs: number;
  effectiveFrom: Date;
  updatedBy: mongoose.Types.ObjectId;
  note?: string;
}

export interface ICogsRule extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  productId: string;        // external product ID
  variantId?: string;       // null = applies to all variants
  productName: string;
  variantTitle?: string;
  sku?: string;
  // Current COGS
  cogs: number;
  // Landed cost components
  supplierCost: number;
  shippingToWarehouse: number;
  importDuties: number;
  packagingCost: number;
  prepCost: number;
  otherLandedCost: number;
  // History — every past value stored
  history: ICogsHistory[];
  currency: string;
  applyToNewOrders: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CogsHistorySchema = new Schema<ICogsHistory>({
  cogs: { type: Number, required: true },
  effectiveFrom: { type: Date, required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  note: String,
});

const CogsRuleSchema = new Schema<ICogsRule>(
  {
    teamId:     { type: Schema.Types.ObjectId, ref: "Team",  required: true, index: true },
    storeId:    { type: Schema.Types.ObjectId, ref: "Store", required: true },
    productId:  { type: String, required: true },
    variantId:  String,
    productName: { type: String, required: true },
    variantTitle: String,
    sku:        String,
    cogs:             { type: Number, default: 0 },
    supplierCost:     { type: Number, default: 0 },
    shippingToWarehouse: { type: Number, default: 0 },
    importDuties:     { type: Number, default: 0 },
    packagingCost:    { type: Number, default: 0 },
    prepCost:         { type: Number, default: 0 },
    otherLandedCost:  { type: Number, default: 0 },
    history:          [CogsHistorySchema],
    currency:         { type: String, default: "USD" },
    applyToNewOrders: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CogsRuleSchema.index({ teamId: 1, storeId: 1, productId: 1, variantId: 1 }, { unique: true, sparse: true });
CogsRuleSchema.index({ teamId: 1, sku: 1 });

export default models.CogsRule || model<ICogsRule>("CogsRule", CogsRuleSchema);
