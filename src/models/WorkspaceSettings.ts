import mongoose, { Schema, Document, model, models } from "mongoose";

/** Workspace-level settings that do not belong on Team itself:
 *  fiscal month start, default date range, profit-definition toggles,
 *  tax/VAT mode and per-country VAT rates, FX source + manual overrides.
 *  One document per team (upsert by teamId).
 *
 *  Two currency fields, different jobs:
 *   - reportingCurrency: what server reports are aggregated in.
 *   - displayCurrency: what money figures are SHOWN in on the
 *     dashboard (the header switcher's choice). It never changes
 *     stored numbers — figures are converted at display time from
 *     the report base currency at the live FX rate.
 *     NOTE: displayCurrency has NO default, deliberately. "Never
 *     set" must stay distinguishable from "explicitly set to USD":
 *     the display precedence (CurrencyContext) treats an unset team
 *     value as no choice, so location auto-detect can seed the
 *     default — a defaulted "USD" here would block geo detection
 *     for every team that never chose a currency. Readers that
 *     need a concrete currency fall back to reportingCurrency
 *     themselves (see GET /api/settings/workspace and
 *     resolveDisplayCurrency). */
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
  /** Team default display currency — undefined when the team never chose one (see the note above). */
  displayCurrency?: string;
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
    // No default — see the comment on the interface above.
    displayCurrency: { type: String },
    fxSource: { type: String, default: "currencyapi.net" },
    fxOverrides: { type: [FxOverrideSchema], default: [] },
  },
  { timestamps: true },
);

export default models.WorkspaceSettings || model<IWorkspaceSettings>("WorkspaceSettings", WorkspaceSettingsSchema);
