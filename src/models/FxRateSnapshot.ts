import mongoose, { Schema, Document, model, models } from "mongoose";

/**
 * FxRateSnapshot — the ONE saved copy of the currencyapi.net rates.
 *
 * The free currencyapi.net plan allows 500 requests a month. An
 * in-process cache cannot respect that on serverless: every instance
 * fetches on its own. So rates live here instead — a single document
 * (key "USD") holding the whole USD rates table, shared by every
 * instance, refreshed every 90 minutes:
 *   24h / 1.5h = 16 refreshes a day -> 480 a month (30 days), 496 (31).
 *
 * Replacement rule: the old snapshot is replaced only AFTER new rates
 * have been fetched successfully (findOneAndReplace with upsert — one
 * atomic operation, so the collection never holds two snapshots and
 * never holds zero). A failed fetch never deletes the last good rates;
 * the stale snapshot is then served until the next refresh succeeds.
 *
 * The snapshot always stores the USD-based table. Any other base is
 * derived mathematically in memory (see rebaseRates in src/lib/fx),
 * so one document serves every base currency. Team FX overrides are
 * NEVER stored here — overrides live on WorkspaceSettings and are
 * applied on top of these provider rates per request.
 */
export type FxSnapshotSource = "currencyapi.net" | "er-api";

export interface IFxRateSnapshot extends Document {
  _id: mongoose.Types.ObjectId;
  /** Stable key — "USD". One document per key; today only USD exists. */
  key: string;
  /** Base currency of the stored table — always "USD". */
  base: string;
  /** Units per 1 USD, e.g. { EUR: 0.92, PKR: 278.5 }. USD itself is 1. */
  rates: Record<string, number>;
  /** The provider's `updated` timestamp (when the data was published). */
  fetchedAt: Date;
  /** Which provider produced this snapshot. */
  source: FxSnapshotSource;
  /** Refresh lock: when the current refresh was claimed (null = free). */
  refreshingAt: Date | null;
  /** Refresh lock: token of the instance holding the claim. */
  refreshingBy: string | null;
  createdAt: Date;
  /** When this snapshot was saved — the TTL clock runs from here, not
   *  from fetchedAt: free-plan provider data is already up to an hour
   *  old when it arrives, and measuring from fetchedAt would halve
   *  the effective cache life and double the monthly request count. */
  updatedAt: Date;
}

const FxRateSnapshotSchema = new Schema<IFxRateSnapshot>(
  {
    key: { type: String, required: true, unique: true, index: true },
    base: { type: String, required: true, default: "USD" },
    rates: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    source: {
      type: String,
      enum: ["currencyapi.net", "er-api"],
      required: true,
    },
    // Refresh lock: which instance is fetching right now, and when it
    // claimed the refresh. The dashboard page and /api/fx/rates run in
    // SEPARATE server bundles in production (and separate serverless
    // instances on Vercel), so an in-process single-flight cannot dedup
    // them — without this lock they each spend a provider call on the
    // same refresh (2 per 90-minute window, 960/month, over the free
    // plan's 500). A successful save replaces the whole document and
    // clears the lock; a failed fetch releases it explicitly. A lock
    // older than 60s is treated as crashed and may be re-claimed.
    refreshingAt: { type: Date, default: null },
    refreshingBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const FxRateSnapshotModel =
  (models.FxRateSnapshot as mongoose.Model<IFxRateSnapshot> | undefined) ??
  model<IFxRateSnapshot>("FxRateSnapshot", FxRateSnapshotSchema);
