import mongoose, { Schema, Document, model, models } from "mongoose";

/** Recurring or one-off operating expense, allocated into P&L by date. */
export interface IMonthlyExpense extends Document {
  teamId: mongoose.Types.ObjectId;
  name: string;
  category: string;
  amount: number;
  currency: string;
  startDate: Date;
  endDate?: Date | null;
  isRecurring: boolean;
  taxInclusive: boolean;
  allocation: "per_day" | "per_order" | "by_revenue";
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyExpenseSchema = new Schema<IMonthlyExpense>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isRecurring: { type: Boolean, default: false },
    taxInclusive: { type: Boolean, default: false },
    allocation: { type: String, enum: ["per_day", "per_order", "by_revenue"], default: "per_day" },
    notes: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

MonthlyExpenseSchema.index({ teamId: 1, startDate: 1 });

export default models.MonthlyExpense || model<IMonthlyExpense>("MonthlyExpense", MonthlyExpenseSchema);
