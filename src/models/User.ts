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
  // Two-factor authentication (S1.1) — secret is AES-256-GCM encrypted
  // (encryption-v2) before write; never stored raw.
  twoFactorSecretEncrypted?: string;
  twoFactorEnabled: boolean;
  twoFactorRecoveryHashes: string[]; // SHA-256, single-use (removed on use)
  twoFactorEnforcedAt?: Date;
  // Session revocation (S1.2): bump to invalidate all JWT sessions.
  sessionVersion: number;
  // Login protection (S1.3): last login fingerprint for new-device alerts.
  lastLoginIpTruncated?: string;
  lastLoginAt?: Date;
  // Privacy (S2): deletion request with grace period.
  deletionRequestedAt?: Date;
  deletionScheduledAt?: Date;
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
    twoFactorSecretEncrypted:  { type: String, select: false },
    twoFactorEnabled:          { type: Boolean, default: false },
    twoFactorRecoveryHashes:   [{ type: String, select: false }],
    twoFactorEnforcedAt:       Date,
    sessionVersion:            { type: Number, default: 0 },
    lastLoginIpTruncated:      String,
    lastLoginAt:               Date,
    deletionRequestedAt:       Date,
    deletionScheduledAt:       Date,
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
