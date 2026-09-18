import mongoose, { Schema, Document, model, models } from "mongoose";

export type BillingGateway = "paddle";
export type PlanId = "starter" | "growth" | "pro";
export type BillingInterval = "monthly" | "quarterly" | "semiannual" | "annual";
export type SubStatus = "trialing" | "active" | "past_due" | "cancelled" | "paused";

export interface ISubscription extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  gateway: BillingGateway;
  externalId: string;       // Paddle subscription ID
  customerId: string;       // Paddle customer ID
  plan: PlanId;
  interval: BillingInterval;
  status: SubStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  priceId: string;
  amount: number;           // in cents
  currency: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, unique: true },
    gateway: { type: String, enum: ["paddle"], required: true, default: "paddle" },
    externalId: { type: String, required: true },
    customerId: { type: String, required: true },
    plan: { type: String, enum: ["starter", "growth", "pro"], required: true },
    interval: {
      type: String,
      enum: ["monthly", "quarterly", "semiannual", "annual"],
      default: "monthly",
    },
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "cancelled", "paused"],
      default: "trialing",
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: Date,
    trialStart: Date,
    trialEnd: Date,
    priceId: String,
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    metadata: { type: Map, of: String },
  },
  { timestamps: true }
);

export default models.Subscription || model<ISubscription>("Subscription", SubscriptionSchema);
