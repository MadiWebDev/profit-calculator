import mongoose, { Schema, Document, model, models } from "mongoose";

/** Idempotency for v1 writes (F1.10): same key + team = same response, 24h. */
export interface IIdempotencyKey extends Document {
  teamId: mongoose.Types.ObjectId;
  keyHash: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    keyHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

IdempotencyKeySchema.index({ teamId: 1, keyHash: 1 }, { unique: true });

export default models.IdempotencyKey || model<IIdempotencyKey>("IdempotencyKey", IdempotencyKeySchema);
