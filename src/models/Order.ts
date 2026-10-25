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
  cogsBackfilled?: boolean;
  shippingCost: number;     // cost to merchant (not charged to customer)
  shippingRevenue: number;  // what customer paid for shipping
  transactionFees: number;  // platform + payment fees
  taxes: number;            // taxes collected
  refundAmount: number;
  chargebackAmount: number;
  adSpendAllocated: number; // allocated ad spend for this order
  // Phase 3 extended costs (all default 0; see profit-extended.ts)
  packagingCost?: number;
  codFee?: number;
  subscriptionShare?: number;
  rtoLoss?: number;
  expenseAllocation?: number;
  otherCosts?: number;
  taxMode?: "exclusive" | "inclusive";
  fxRateAtOrder?: number;
  paymentMethod?: string;
  codCollected?: number;
  codPending?: number;
  // Computed
  netProfit: number;
  profitMargin: number;  // %
  // Line items
  lineItems: IOrderLineItem[];
  // Customer info
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  billingCity?: string;
  billingPostalCode?: string;
  browserIp?: string;
  // Phase 4 risk scoring (see src/lib/risk-engine.ts + risk-scoring.ts)
  riskScore?: number;
  riskBand?: "low" | "medium" | "high" | "critical";
  riskReasons?: { code: string; label: string; points: number; detail: string }[];
  riskStatus?: "unreviewed" | "genuine" | "fake";
  riskAutoTag?: string;
  riskHoldFulfillment?: boolean;
  riskScoredAt?: Date;
  moneySaved?: number;
  isFirstOrder: boolean;
  // Fulfillment (from fulfillments webhooks / courier module)
  fulfillmentStatus?: string;
  trackingNumber?: string;
  trackingCompany?: string;
  // Status
  status: "pending" | "fulfilled" | "refunded" | "cancelled";
  source?: string; // utm_source or referral
  utmCampaign?: string; // utm_campaign from the landing page URL
  landingSite?: string; // full landing page URL (UTM source of truth)
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
    /** Set by the backfill-cogs job when COGS was auto-applied from a rule. */
    cogsBackfilled: { type: Boolean, default: false },
    shippingCost: { type: Number, default: 0 },
    shippingRevenue: { type: Number, default: 0 },
    transactionFees: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    chargebackAmount: { type: Number, default: 0 },
    adSpendAllocated: { type: Number, default: 0 },
    packagingCost: { type: Number, default: 0 },
    codFee: { type: Number, default: 0 },
    subscriptionShare: { type: Number, default: 0 },
    rtoLoss: { type: Number, default: 0 },
    expenseAllocation: { type: Number, default: 0 },
    otherCosts: { type: Number, default: 0 },
    taxMode: { type: String, enum: ["exclusive", "inclusive"], default: "exclusive" },
    fxRateAtOrder: Number,
    paymentMethod: String,
    codCollected: { type: Number, default: 0 },
    codPending: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    lineItems: [LineItemSchema],
    customerId: String,
    customerEmail: String,
    customerName: String,
    customerPhone: String,
    shippingCity: String,
    shippingPostalCode: String,
    shippingCountry: String,
    billingCity: String,
    billingPostalCode: String,
    browserIp: String,
    riskScore: Number,
    riskBand: { type: String, enum: ["low", "medium", "high", "critical"] },
    riskReasons: [{ code: String, label: String, points: Number, detail: String }],
    riskStatus: { type: String, enum: ["unreviewed", "genuine", "fake"], default: "unreviewed" },
    riskAutoTag: String,
    riskHoldFulfillment: Boolean,
    riskScoredAt: Date,
    moneySaved: { type: Number, default: 0 },
    isFirstOrder: { type: Boolean, default: false },
    fulfillmentStatus: String,
    trackingNumber: String,
    trackingCompany: String,
    status: {
      type: String,
      enum: ["pending", "fulfilled", "refunded", "cancelled"],
      default: "fulfilled",
    },
    source: String,
    utmCampaign: String,
    landingSite: String,
    importedFrom: { type: String, enum: ["api", "csv", "webhook"] },
  },
  { timestamps: true }
);

OrderSchema.index({ storeId: 1, externalId: 1 }, { unique: true });
// Canonical upsert key — every sync path upserts by (teamId, storeId, externalId)
OrderSchema.index({ teamId: 1, storeId: 1, externalId: 1 }, { unique: true });
OrderSchema.index({ teamId: 1, orderDate: -1 });
OrderSchema.index({ teamId: 1, customerId: 1 });
OrderSchema.index({ teamId: 1, riskBand: 1, riskStatus: 1 });
OrderSchema.index({ teamId: 1, customerPhone: 1 });

export default models.Order || model<IOrder>("Order", OrderSchema);
