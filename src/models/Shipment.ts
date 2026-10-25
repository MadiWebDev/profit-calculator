import mongoose, { Schema, Document, model, models } from "mongoose";
import type { ShipmentStatus } from "@/lib/courier";

/**
 * Phase 6: one shipment, linked to a Shopify order when known.
 * Status values are exactly the courier.ts ShipmentStatus set so the
 * pure metrics/ranking functions can consume these documents directly.
 */
export interface IShipment extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  courierId?: mongoose.Types.ObjectId;
  courier: string;
  orderId?: mongoose.Types.ObjectId;
  trackingNumber: string;
  city: string;
  region: string;
  postalCode: string;
  status: ShipmentStatus;
  cost: number;
  codAmount: number;
  codCollected: boolean;
  codSettledAt?: Date;
  bookedAt: Date;
  deliveredAt?: Date;
  attempts: number;
  source: "csv" | "manual" | "api";
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store" },
    courierId: { type: Schema.Types.ObjectId, ref: "Courier" },
    courier: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    trackingNumber: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "booked", "picked_up", "in_transit", "out_for_delivery",
        "delivered", "failed_attempt", "returned_rto", "cancelled",
      ],
      required: true,
    },
    cost: { type: Number, default: 0 },
    codAmount: { type: Number, default: 0 },
    codCollected: { type: Boolean, default: false },
    codSettledAt: Date,
    bookedAt: { type: Date, required: true },
    deliveredAt: Date,
    attempts: { type: Number, default: 1 },
    source: { type: String, enum: ["csv", "manual", "api"], default: "manual" },
  },
  { timestamps: true }
);

ShipmentSchema.index({ teamId: 1, courier: 1, trackingNumber: 1 });
ShipmentSchema.index({ teamId: 1, city: 1 });
ShipmentSchema.index({ teamId: 1, orderId: 1 });
ShipmentSchema.index({ teamId: 1, status: 1, bookedAt: 1 });

export default models.Shipment || model<IShipment>("Shipment", ShipmentSchema);
