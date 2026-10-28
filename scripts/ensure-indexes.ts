/**
 * ensure-indexes.ts — create every index declared in the Mongoose schemas.
 *
 * Mongoose auto-creates indexes on model registration, but in production
 * (autoIndex: false, or when a deploy adds an index to an existing
 * collection) an explicit pass is the reliable path. Idempotent: MongoDB
 * skips indexes that already exist.
 *
 * Usage:
 *   npx tsx scripts/ensure-indexes.ts [--dry-run]
 *
 * In Docker/production, run once per deploy before starting the app:
 *   npx tsx scripts/ensure-indexes.ts
 */
import mongoose from "mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

// Import every model so its schema indexes are registered
import "../src/models/AdAccount";
import "../src/models/AlertRule";
import "../src/models/Blocklist";
import "../src/models/Courier";
import "../src/models/DailyRollup";
import "../src/models/RiskSignalWeight";
import "../src/models/Shipment";
import "../src/models/AdSpendDaily";
import "../src/models/ApiKey";
import "../src/models/AuditLog";
import "../src/models/Blog";
import "../src/models/Bundle";
import "../src/models/CogsRule";
import "../src/models/CronRun";
import "../src/models/Insight";
import "../src/models/Notification";
import "../src/models/Order";
import "../src/models/Product";
import "../src/models/ProfitGoal";
import "../src/models/Store";
import "../src/models/Subscription";
import "../src/models/Team";
import "../src/models/User";
import "../src/models/WebhookEvent";
import "../src/models/WebhookSubscription";
import "../src/models/SecurityEvent";
import "../src/models/SessionDevice";
import "../src/models/ClientWorkspace";
import "../src/models/Comment";
import "../src/models/IdempotencyKey";
import "../src/models/ConversionEvent";
import "../src/models/MonthlyExpense";
import "../src/models/OtherFeeRule";
import "../src/models/GatewayFee";
import "../src/models/SavedView";
import "../src/models/ScheduledReport";
import "../src/models/WorkspaceSettings";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);

  let created = 0;
  let alreadyThere = 0;

  for (const model of Object.values(mongoose.models)) {
    const indexes = model.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    for (const [fields, options] of indexes) {
      const name =
        (options as { name?: string }).name ??
        Object.entries(fields)
          .map(([k, v]) => `${k}_${v}`)
          .join("_");
      const existing = await model.collection.indexExists(name).catch(() => false);
      if (existing) {
        alreadyThere++;
        continue;
      }
      console.log(
        `${DRY_RUN ? "[dry-run] would create" : "creating"} index ${model.collection.name}.${name}`
      );
      if (!DRY_RUN) {
        await model.collection.createIndex(fields as Parameters<typeof model.collection.createIndex>[0], options);
        created++;
      }
    }
  }

  console.log(`done — created=${created} alreadyPresent=${alreadyThere} dryRun=${DRY_RUN}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("ensure-indexes failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
