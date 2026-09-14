import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password?: string; // hashed, undefined for OAuth users
  image?: string;
  emailVerified?: Date;
  teamId?: mongoose.Types.ObjectId;
  role: "superAdmin" | "owner";
  plan: "free" | "starter" | "growth" | "pro";
  trialEndsAt?: Date;
  onboardingCompleted: boolean;
  resetPasswordToken?: string;
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
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    role: { type: String, enum: ["superAdmin", "owner"], default: "owner" },
    plan: { type: String, enum: ["free", "starter", "growth", "pro"], default: "free" },
    trialEndsAt: Date,
    onboardingCompleted: { type: Boolean, default: false },
    resetPasswordToken:   { type: String, select: false },
    resetPasswordExpires: { type: Date,   select: false },
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
