import mongoose, { Schema, Document, model, models } from "mongoose";
import type { OrderEvent, Channel } from "@/lib/whatsapp";

/**
 * Phase 9a: one merchant rule per order event. The merchant picks the
 * channel (whatsapp / email / both) and can disable an event entirely.
 * The cod_tracking rule IS the "send tracking ID for COD orders"
 * toggle: when enabled, COD orders get the COD tracking message (with
 * tracking ID + courier + COD wording) instead of the generic shipped
 * message; when disabled, COD orders get the normal shipped message.
 */
export interface INotifyRule extends Document {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  event: OrderEvent;
  channel: Channel;
  enabled: boolean;
  whatsappTemplate?: string;
  emailSubject?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotifyRuleSchema = new Schema<INotifyRule>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    event: {
      type: String,
      enum: [
        "order_confirmed", "order_shipped", "out_for_delivery", "delivered",
        "cancelled", "refund_issued", "cod_tracking",
      ],
      required: true,
    },
    channel: { type: String, enum: ["whatsapp", "email", "both"], default: "both" },
    enabled: { type: Boolean, default: true },
    whatsappTemplate: String,
    emailSubject: String,
  },
  { timestamps: true }
);

NotifyRuleSchema.index({ teamId: 1, event: 1 }, { unique: true });

export default models.NotifyRule || model<INotifyRule>("NotifyRule", NotifyRuleSchema);
