import mongoose, { Schema, Document, model, models } from "mongoose";

/** Agency mode (F1.1): one agency team manages many client workspaces. */
export interface IClientWorkspace extends Document {
  agencyTeamId: mongoose.Types.ObjectId;
  name: string;
  clientEmail?: string;
  storeIds: mongoose.Types.ObjectId[];
  brandLogoUrl?: string;
  brandColor?: string;
  brandDomain?: string;
  portalTokenHash?: string; // SHA-256 of the read-only portal link token
  portalExpiresAt?: Date;
  permissions: string[]; // per-client permission keys granted to agency staff
  createdAt: Date;
  updatedAt: Date;
}

const ClientWorkspaceSchema = new Schema<IClientWorkspace>(
  {
    agencyTeamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, trim: true },
    clientEmail: { type: String, lowercase: true, trim: true },
    storeIds: [{ type: Schema.Types.ObjectId, ref: "Store" }],
    brandLogoUrl: String,
    brandColor: String,
    brandDomain: String,
    portalTokenHash: { type: String, select: false },
    portalExpiresAt: Date,
    permissions: [{ type: String }],
  },
  { timestamps: true },
);

export default models.ClientWorkspace || model<IClientWorkspace>("ClientWorkspace", ClientWorkspaceSchema);
