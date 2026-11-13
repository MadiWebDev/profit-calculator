import mongoose, { Schema, Document, model, models } from "mongoose";

export type AdPlatform = "meta" | "google" | "tiktok" | "pinterest" | "snapchat";

export interface IAdAccount extends Document {
  _id: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  platform: AdPlatform;
  accountId: string;
  accountName: string;
  currency: string;
  timezone?: string; // Meta ad account timezone (timezone_name), best-effort
  accessToken: string | null;   // AES-encrypted; null when disconnected
  refreshToken?: string | null; // AES-encrypted
  tokenExpiresAt?: Date;
  /**
   * Meta user id (from `/v21.0/me`) that connected this account.
   * Stored at OAuth time so the data-deletion / deauthorize callbacks
   * can find and delete the account (F11: without this field Mongoose
   * strict mode dropped the upserted value and the deletion query
   * could never match, yet the route still returned success to Meta).
   */
  metaUserId?: string;
  lastSyncAt?: Date;
  /**
   * Oldest date with contiguous ad-spend coverage (backfill tracker).
   * Null = never backfilled. After each backfill chunk the sync
   * persists the chunk's start here, so a later run resumes from it
   * instead of re-pulling completed chunks; once this is ≥365 days
   * ago, runs are incremental only.
   */
  backfillThrough?: Date | null;
  syncStatus: "idle" | "syncing" | "error" | "never" | "disconnected";
  syncError?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdAccountSchema = new Schema<IAdAccount>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: false, index: true },
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
    metaUserId: { type: String, index: true },
    lastSyncAt: Date,
    backfillThrough: Date,
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
