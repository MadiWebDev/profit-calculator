import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IAdSpendDaily extends Document {
  _id: mongoose.Types.ObjectId;
  adAccountId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  platform: string;
  date: Date;
  // Campaign-level
  campaignId?: string;
  campaignName?: string;
  // Ad set level
  adSetId?: string;
  adSetName?: string;
  // Ad / creative level
  adId?: string;
  adName?: string;
  // Spend & attribution
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueAttributed: number;
  // Computed profit (after applying COGS ratio)
  profitAttributed: number;
  roas: number;
  cpa: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdSpendDailySchema = new Schema<IAdSpendDaily>(
  {
    adAccountId: { type: Schema.Types.ObjectId, ref: "AdAccount", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    platform: { type: String, required: true },
    date: { type: Date, required: true },
    campaignId: String,
    campaignName: String,
    adSetId: String,
    adSetName: String,
    adId: String,
    adName: String,
    spend: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueAttributed: { type: Number, default: 0 },
    profitAttributed: { type: Number, default: 0 },
    roas: { type: Number, default: 0 },
    cpa: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
  },
  { timestamps: true }
);

AdSpendDailySchema.index({ teamId: 1, date: -1 });
AdSpendDailySchema.index({ adAccountId: 1, date: 1 });
AdSpendDailySchema.index(
  { adAccountId: 1, date: 1, campaignId: 1, adSetId: 1, adId: 1 },
  { unique: true, sparse: true }
);

export default models.AdSpendDaily || model<IAdSpendDaily>("AdSpendDaily", AdSpendDailySchema);
