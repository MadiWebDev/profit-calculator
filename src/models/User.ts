import mongoose, { Schema, Document, model, models } from "mongoose";

export type PlatformRole = "user" | "superAdmin";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password?: string; // hashed, undefined for OAuth users
  image?: string;
  emailVerified?: Date;
  teamId?: mongoose.Types.ObjectId;
  /**
   * Platform-level role. Team-level role lives on Team.members[].role.
   * `role` is kept for backward compatibility during the migration
   * (see scripts/migrate-roles.ts) — prefer platformRole in new code.
   */
  platformRole: PlatformRole;
  role: "superAdmin" | "owner";
  plan: "free" | "starter" | "growth" | "pro";
  trialEndsAt?: Date;
  onboardingCompleted: boolean;
  // Auth hardening (Phase 4)
  failedLoginAttempts: number;
  lockoutUntil?: Date;
  passwordChangedAt?: Date;
  emailVerificationTokenHash?: string;
  emailVerificationExpires?: Date;
  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    image: String,
    emailVerified: Date,
    teamId: { type: Schema.Types.ObjectId, ref: "Team", index: true },
    platformRole: { type: String, enum: ["user", "superAdmin"], default: "user" },
    role: { type: String, enum: ["superAdmin", "owner"], default: "owner" },
    plan: { type: String, enum: ["free", "starter", "growth", "pro"], default: "free" },
    trialEndsAt: Date,
    onboardingCompleted: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: Date,
    passwordChangedAt: Date,
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires:  { type: Date,   select: false },
    resetPasswordTokenHash:    { type: String, select: false },
    resetPasswordExpires:      { type: Date,   select: false },
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
