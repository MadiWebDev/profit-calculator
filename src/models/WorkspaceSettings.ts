import mongoose, { Schema, Document, model, models } from "mongoose";

/** Workspace-level settings that do not belong on Team itself:
 *  fiscal month start, default date range, profit-definition toggles,
 *  tax/VAT mode and per-country VAT rates, FX source + manual overrides.
 *  One document per team (upsert by teamId). */
export interface IWorkspaceSettings extends Document {
  teamId: mongoose.Types.ObjectId;
  fiscalMonthStartDay: number;
  defaultDateRangeDays: number;
  includeShippingRevenueInProfit: boolean;
  includeTaxesInProfit: boolean;
  includeAdSpendInProfit: boolean;
  taxMode: "exclusive" | "inclusive";
  reverseCharge: boolean;
  vatRates: { country: string; rate: number }[];
  reportingCurrency: string;
  fxSource: string;
  fxOverrides: { currency: string; rate: number; effectiveFrom: Date }[];
  updatedAt: Date;
}

const VatRateSchema = new Schema({ country: String, rate: Number }, { _id: false });
const FxOverrideSchema = new Schema(
  { currency: String, rate: Number, effectiveFrom: Date },
  { _id: false },
);

const WorkspaceSettingsSchema = new Schema<IWorkspaceSettings>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, unique: true, index: true },
    fiscalMonthStartDay: { type: Number, default: 1, min: 1, max: 28 },
    defaultDateRangeDays: { type: Number, default: 30, min: 7, max: 365 },
    includeShippingRevenueInProfit: { type: Boolean, default: true },
    includeTaxesInProfit: { type: Boolean, default: false },
    includeAdSpendInProfit: { type: Boolean, default: true },
    taxMode: { type: String, enum: ["exclusive", "inclusive"], default: "exclusive" },
    reverseCharge: { type: Boolean, default: false },
    vatRates: { type: [VatRateSchema], default: [] },
    reportingCurrency: { type: String, default: "USD" },
    fxSource: { type: String, default: "open.er-api.com" },
    fxOverrides: { type: [FxOverrideSchema], default: [] },
  },
  { timestamps: true },
);

export default models.WorkspaceSettings || model<IWorkspaceSettings>("WorkspaceSettings", WorkspaceSettingsSchema);
