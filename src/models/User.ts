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
  /**
   * Optional WhatsApp number (E.164, e.g. +923001234567) the user sets
   * in Dashboard → Settings → Profile. Only used as the audience for
   * admin WhatsApp campaigns — never for order notifications, which use
   * the phone on the order itself. Users without a number are skipped
   * (and counted) by campaign sends, never errored.
   */
  phone?: string;
  /**
   * Personal display currency (ISO 4217, e.g. "PKR") the user picks in
   * Dashboard → Settings → Profile. This is the user-level preference:
   * when set it wins over the team workspace currency, the browser's
   * stored choice, and location auto-detection — and nothing automatic
   * ever changes it. Undefined = "never set" (precedence falls through
   * to the team setting and below). Saved via PATCH /api/user.
   *
   * LOCKED since the onboarding build: once set (during onboarding),
   * PATCH /api/user rejects any further write with 400 CURRENCY_LOCKED.
   */
  displayCurrency?: string | null;
  /**
   * Personal display timezone (IANA, e.g. "Asia/Karachi") the user picks
   * in the onboarding modal. The dashboard's display timezone for
   * dates/times (see src/lib/display-timezone.ts). Like displayCurrency,
   * write-once: once set, PATCH /api/user rejects any further write
   * with 400 TIMEZONE_LOCKED. Undefined = "never set" (the team
   * timezone, then the browser timezone, is the display fallback).
   */
  timezone?: string | null;
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
  // Session policy: last activity seen by the auth jwt() check (updated at
  // most once per 5 minutes per session). Drives the idle timeout.
  lastSeenAt?: Date;
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
    phone: { type: String, trim: true, maxlength: 20 },
    displayCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
    timezone: { type: String, trim: true, match: /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+)$/ },
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
    lastSeenAt:                Date,
    deletionRequestedAt:       Date,
    deletionScheduledAt:       Date,
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
