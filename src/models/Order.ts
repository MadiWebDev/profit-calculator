import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IOrderLineItem {
  productId?: string;
  sku?: string;
  name: string;
  quantity: number;
  price: number;       // selling price per unit
  cogs: number;        // cost of goods per unit
  totalRevenue: number;
  totalCogs: number;
}

export interface IOrder extends Document {
  _id: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  externalId: string;   // platform order ID
  orderNumber?: string;
  orderDate: Date;
  currency: string;
  // Revenue components
  grossRevenue: number;
  discounts: number;
  netRevenue: number;  // grossRevenue - discounts
  // Cost components
  totalCogs: number;
  shippingCost: number;     // cost to merchant (not charged to customer)
  shippingRevenue: number;  // what customer paid for shipping
  transactionFees: number;  // platform + payment fees
  taxes: number;            // taxes collected
  refundAmount: number;
  chargebackAmount: number;
  adSpendAllocated: number; // allocated ad spend for this order
  // Computed
  netProfit: number;
  profitMargin: number;  // %
  // Line items
  lineItems: IOrderLineItem[];
  // Customer info
  customerId?: string;
  customerEmail?: string;
  isFirstOrder: boolean;
  // Status
  status: "pending" | "fulfilled" | "refunded" | "cancelled";
  source?: string; // utm_source or referral
  importedFrom?: "api" | "csv" | "webhook";
  createdAt: Date;
  updatedAt: Date;
}

const LineItemSchema = new Schema<IOrderLineItem>({
  productId: String,
  sku: String,
  name: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  price: { type: Number, required: true, default: 0 },
  cogs: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalCogs: { type: Number, default: 0 },
});

const OrderSchema = new Schema<IOrder>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    externalId: { type: String, required: true },
    orderNumber: String,
    orderDate: { type: Date, required: true, index: true },
    currency: { type: String, default: "USD" },
    grossRevenue: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    totalCogs: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    shippingRevenue: { type: Number, default: 0 },
    transactionFees: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    chargebackAmount: { type: Number, default: 0 },
    adSpendAllocated: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    lineItems: [LineItemSchema],
    customerId: String,
    customerEmail: String,
    isFirstOrder: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "fulfilled", "refunded", "cancelled"],
      default: "fulfilled",
    },
    source: String,
    importedFrom: { type: String, enum: ["api", "csv", "webhook"] },
  },
  { timestamps: true }
);

OrderSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
OrderSchema.index({ teamId: 1, orderDate: -1 });
OrderSchema.index({ teamId: 1, customerId: 1 });

export default models.Order || model<IOrder>("Order", OrderSchema);
