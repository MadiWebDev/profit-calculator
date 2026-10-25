import mongoose, { Schema, Document, model, models } from "mongoose";

export type AdPlatform = "meta" | "google" | "tiktok" | "pinterest" | "snapchat";

export interface IAdAccount extends Document {
  _id: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  platform: AdPlatform;
  accountId: string;
  accountName: string;
  currency: string;
  timezone?: string; // Meta ad account timezone (timezone_name), best-effort
  accessToken: string | null;   // AES-encrypted; null when disconnected
  refreshToken?: string | null; // AES-encrypted
  tokenExpiresAt?: Date;
  lastSyncAt?: Date;
  syncStatus: "idle" | "syncing" | "error" | "never" | "disconnected";
  syncError?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdAccountSchema = new Schema<IAdAccount>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    platform: {
      type: String,
      enum: ["meta", "google", "tiktok", "pinterest", "snapchat"],
      required: true,
    },
    accountId: { type: String, required: true },
    accountName: String,
    currency: { type: String, default: "USD" },
    timezone: String,
    accessToken: { type: String, default: null },
    refreshToken: String,
    tokenExpiresAt: Date,
    lastSyncAt: Date,
    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "error", "never", "disconnected"],
      default: "never",
    },
    syncError: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AdAccountSchema.index({ teamId: 1, platform: 1, accountId: 1 }, { unique: true });

export default models.AdAccount || model<IAdAccount>("AdAccount", AdAccountSchema);
