import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Tenant blocklist (Phase 4): hashed identifiers of customers the
 * merchant has confirmed as fake. Only SHA-256 hashes are stored —
 * never the raw phone, email or address — so a database leak does not
 * expose customer contact details. Matching hashes the incoming
 * value with the same normalisation (see src/lib/risk-scoring.ts).
 */
export type BlocklistKind = "phone" | "email" | "address";

export interface IBlocklist extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  kind: BlocklistKind;
  valueHash: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BlocklistSchema = new Schema<IBlocklist>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    kind: { type: String, enum: ["phone", "email", "address"], required: true },
    valueHash: { type: String, required: true },
    reason: String,
  },
  { timestamps: true }
);

BlocklistSchema.index({ teamId: 1, kind: 1, valueHash: 1 }, { unique: true });

export default models.Blocklist || model<IBlocklist>("Blocklist", BlocklistSchema);
