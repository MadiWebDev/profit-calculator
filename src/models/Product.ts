import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IVariantCogs {
  variantId: string;
  variantTitle: string;
  cogs: number;
}

export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  externalId?: string;
  name: string;
  sku?: string;
  defaultCogs: number;
  variantCogs: IVariantCogs[];
  currency: string;
  imageUrl?: string;
  isActive: boolean;
  // Aggregated stats (recomputed on sync)
  totalRevenue: number;
  totalCogs: number;
  totalProfit: number;
  totalOrders: number;
  avgProfitMargin: number;
  createdAt: Date;
  updatedAt: Date;
}

const VariantCogsSchema = new Schema<IVariantCogs>({
  variantId: { type: String, required: true },
  variantTitle: String,
  cogs: { type: Number, required: true, default: 0 },
});

const ProductSchema = new Schema<IProduct>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    externalId: String,
    name: { type: String, required: true, trim: true },
    sku: String,
    defaultCogs: { type: Number, default: 0 },
    variantCogs: [VariantCogsSchema],
    currency: { type: String, default: "USD" },
    imageUrl: String,
    isActive: { type: Boolean, default: true },
    totalRevenue: { type: Number, default: 0 },
    totalCogs: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    avgProfitMargin: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ storeId: 1, externalId: 1 }, { sparse: true });
ProductSchema.index({ teamId: 1, sku: 1 }, { sparse: true });

export default models.Product || model<IProduct>("Product", ProductSchema);
