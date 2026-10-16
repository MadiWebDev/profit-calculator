import mongoose, { Schema, Document, model, models } from "mongoose";

export type CronRunStatus = "running" | "succeeded" | "partial" | "failed";

export interface ICronRun extends Document {
  _id: mongoose.Types.ObjectId;
  /** Stable job name, e.g. "sync-stores". */
  jobName: string;
  /** Idempotency key — a succeeded run with the same key is never repeated. */
  idempotencyKey: string;
  status: CronRunStatus;
  triggeredBy: "cron" | "manual";
  triggeredByUserId?: mongoose.Types.ObjectId;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  /** Per-item stats, e.g. { stores: 12, succeeded: 11, failed: 1 }. */
  stats: Record<string, number>;
  /** Short error summary when status is failed/partial. */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CronRunSchema = new Schema<ICronRun>(
  {
    jobName:        { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["running", "succeeded", "partial", "failed"],
      default: "running",
      index: true,
    },
    triggeredBy:        { type: String, enum: ["cron", "manual"], required: true },
    triggeredByUserId:  { type: Schema.Types.ObjectId, ref: "User" },
    startedAt:          { type: Date, default: Date.now, index: true },
    finishedAt:         Date,
    durationMs:         Number,
    stats:              { type: Map, of: Number, default: {} },
    error:              { type: String, maxlength: 2000 },
  },
  { timestamps: true }
);

// Recent runs per job, newest first
CronRunSchema.index({ jobName: 1, startedAt: -1 });
// TTL: keep 90 days of run history
CronRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const CronRunModel =
  (models.CronRun as mongoose.Model<ICronRun> | undefined) ??
  model<ICronRun>("CronRun", CronRunSchema);
