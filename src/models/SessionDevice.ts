import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * Login sessions / devices (S1.2). NextAuth JWTs themselves are stateless,
 * so revocation works via User.sessionVersion: auth.ts drops any JWT whose
 * sessionVersion does not match the user's current version (checked at
 * most every 5 minutes, alongside the password-change check). Revoking
 * ALL sessions bumps sessionVersion; revoking ONE device marks that
 * device record revoked and, for JWT sessions, is enforced on the next
 * DB-backed check via the device's lastSeen/token fingerprint list.
 * This record is the source of truth for the sessions page.
 */
export interface ISessionDevice extends Document {
  userId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  deviceFingerprint: string; // SHA-256 of user-agent + coarse device info
  userAgent?: string;
  ipTruncated?: string;
  country?: string;
  lastSeenAt: Date;
  firstSeenAt: Date;
  revokedAt?: Date;
  trustedUntil?: Date; // remember-device (2FA) expiry
  createdAt: Date;
}

const SessionDeviceSchema = new Schema<ISessionDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", index: true },
    deviceFingerprint: { type: String, required: true },
    userAgent: { type: String, maxlength: 300 },
    ipTruncated: String,
    country: String,
    lastSeenAt: { type: Date, default: Date.now, index: true },
    firstSeenAt: { type: Date, default: Date.now },
    revokedAt: Date,
    trustedUntil: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SessionDeviceSchema.index({ userId: 1, revokedAt: 1, lastSeenAt: -1 });

export default models.SessionDevice || model<ISessionDevice>("SessionDevice", SessionDeviceSchema);
