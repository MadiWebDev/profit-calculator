import mongoose, { Schema, Document, model, models } from "mongoose";

/** Scheduled PDF/CSV report (or weekly digest) sent to email/WhatsApp. */
export interface IScheduledReport extends Document {
  teamId: mongoose.Types.ObjectId;
  name: string;
  report: string;
  format: "csv" | "pdf";
  frequency: "weekly" | "monthly";
  channel: "email" | "whatsapp" | "both";
  recipient: string;
  isDigest: boolean;
  isActive: boolean;
  lastSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledReportSchema = new Schema<IScheduledReport>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    report: { type: String, required: true, trim: true, maxlength: 100 },
    format: { type: String, enum: ["csv", "pdf"], default: "csv" },
    frequency: { type: String, enum: ["weekly", "monthly"], default: "weekly" },
    channel: { type: String, enum: ["email", "whatsapp", "both"], default: "email" },
    recipient: { type: String, required: true, trim: true, maxlength: 200 },
    isDigest: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default models.ScheduledReport || model<IScheduledReport>("ScheduledReport", ScheduledReportSchema);
