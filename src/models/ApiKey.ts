import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  keyHash: string;       // SHA-256 hash of the key
  keyPrefix: string;     // first 8 chars for display (e.g. "pc_live_a1b2")
  scopes: ("read:orders" | "read:products" | "read:reports" | "write:cogs")[];
  lastUsedAt?: Date;
  usageCount: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    teamId:    { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name:      { type: String, required: true, trim: true },
    keyHash:   { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    scopes:    [{ type: String, enum: ["read:orders", "read:products", "read:reports", "write:cogs"] }],
    lastUsedAt:  Date,
    usageCount:  { type: Number, default: 0 },
    expiresAt:   Date,
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ApiKeySchema.index({ teamId: 1, isActive: 1 });

export default models.ApiKey || model<IApiKey>("ApiKey", ApiKeySchema);
