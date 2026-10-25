import mongoose, { Schema, Document, model, models } from "mongoose";

/** A saved KPI set / custom dashboard view, optionally shareable via a
 *  read-only link that expires. Shared links carry no auth: they expose
 *  only the aggregated numbers of the view, never order-level PII. */
export interface ISavedView extends Document {
  teamId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  role: string;
  kpis: string[];
  shareToken?: string | null;
  shareExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SavedViewSchema = new Schema<ISavedView>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, default: "all", maxlength: 50 },
    kpis: { type: [String], default: [] },
    shareToken: { type: String, default: null, index: true, sparse: true },
    shareExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default models.SavedView || model<ISavedView>("SavedView", SavedViewSchema);
