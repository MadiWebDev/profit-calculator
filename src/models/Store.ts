import mongoose, { Schema, Document, model, models } from "mongoose";

export type StorePlatform = "shopify" | "csv_manual";

export interface IStore extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  name: string;
  platform: StorePlatform;
  domain?: string;
  currency: string;
  timezone: string;
  // Encrypted OAuth credentials
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date;
  shopifyShopId?: string;
  // Sync state
  lastSyncAt?: Date;
  syncPages?: number;
  syncSyncedCount?: number;
  syncStartedAt?: Date;
  syncStatus: "idle" | "syncing" | "error" | "never" | "disconnected";
  syncError?: string;
  ordersCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: ["shopify", "csv_manual"],
      required: true,
    },
    domain: String,
    currency: { type: String, default: "USD" },
    timezone: { type: String, default: "UTC" },
    accessToken: String,   // AES-encrypted before write
    refreshToken: String,  // AES-encrypted before write
    tokenExpiresAt: Date,
    shopifyShopId: String,
    lastSyncAt: Date,
    syncPages: Number,
    syncSyncedCount: Number,
    syncStartedAt: Date,
    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "error", "never", "disconnected"],
      default: "never",
    },
    syncError: String,
    ordersCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

StoreSchema.index({ teamId: 1, platform: 1 });

export default models.Store || model<IStore>("Store", StoreSchema);
