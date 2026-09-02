import mongoose, { Schema, Document, model, models } from "mongoose";

export interface ITeamMember {
  userId: mongoose.Types.ObjectId;
  role: "owner" | "admin" | "member" | "viewer";
  invitedAt: Date;
  joinedAt?: Date;
  inviteEmail?: string;
  inviteToken?: string;
  inviteExpires?: Date;
  status: "active" | "pending";
}

export interface ITeam extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  ownerId: mongoose.Types.ObjectId;
  members: ITeamMember[];
  plan: "free" | "starter" | "growth" | "pro";
  trialEndsAt?: Date;
  subscriptionId?: string;
  currency: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  role: { type: String, enum: ["owner", "admin", "member", "viewer"], default: "member" },
  invitedAt: { type: Date, default: Date.now },
  joinedAt: Date,
  inviteEmail: String,
  inviteToken: String,
  inviteExpires: Date,
  status: { type: String, enum: ["active", "pending"], default: "active" },
});

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [TeamMemberSchema],
    plan: { type: String, enum: ["free", "starter", "growth", "pro"], default: "free" },
    trialEndsAt: Date,
    subscriptionId: String,
    currency: { type: String, default: "USD" },
    timezone: { type: String, default: "UTC" },
  },
  { timestamps: true }
);

export default models.Team || model<ITeam>("Team", TeamSchema);
