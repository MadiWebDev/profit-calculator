import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * A real cost of running the platform (hosting, database, tools, ...),
 * recorded by the superAdmin so the admin P&L is real, not estimated.
 *
 * Amounts are USD in major units (e.g. 25.5 = $25.50) — the same
 * convention as MonthlyExpense. The month is the cost's billing month
 * ("YYYY-MM"); recurring costs are copied forward by the admin when
 * they recur, never silently.
 */
export type PlatformExpenseCategory =
  | "hosting"
  | "database"
  | "tools"
  | "marketing"
  | "other";

export interface IPlatformExpense extends Document {
  name: string;
  category: PlatformExpenseCategory;
  /** USD, major units. */
  amount: number;
  /** Billing month, "YYYY-MM". */
  month: string;
  isRecurring: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformExpenseSchema = new Schema<IPlatformExpense>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ["hosting", "database", "tools", "marketing", "other"],
      required: true,
      default: "other",
    },
    amount: { type: Number, required: true, min: 0 },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    isRecurring: { type: Boolean, default: false },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

PlatformExpenseSchema.index({ month: 1, createdAt: -1 });

export default models.PlatformExpense ||
  model<IPlatformExpense>("PlatformExpense", PlatformExpenseSchema);
