/**
 * Archive legacy-platform stores (Phase 1, Shopify-only).
 *
 * Run once after deploying the Phase 1 code:
 *   npx tsx scripts/migrate-shopify-only.ts
 *
 * Behaviour (safe by design — nothing is deleted):
 * - Finds stores whose platform is neither "shopify" nor "csv_manual".
 * - For each: wipes its OAuth tokens, marks it inactive and disconnected,
 *   so it can never sync again.
 * - Leaves its historical orders untouched: past profit reports keep
 *   working, and the merchant can still export them.
 * - Prints a JSON archive report (store id, team id, name, order count)
 *   to stdout so the operator has a permanent record.
 *
 * Idempotent: re-running finds no active legacy stores and reports zero.
 */
import { connectDB } from "@/lib/db";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";

async function main(): Promise<void> {
  await connectDB();
  const legacy = await StoreModel.find({
    platform: { $nin: ["shopify", "csv_manual"] },
  }).lean();
  const report = [];
  for (const store of legacy) {
    const orderCount = await OrderModel.countDocuments({ storeId: store._id });
    await StoreModel.updateOne(
      { _id: store._id },
      {
        $set: { isActive: false, syncStatus: "disconnected", syncError: "Archived: platform removed in the Shopify-only rebuild." },
        $unset: { accessToken: "", refreshToken: "" },
      }
    );
    report.push({
      storeId: store._id.toString(),
      teamId: store.teamId.toString(),
      name: store.name,
      legacyPlatform: store.platform,
      orderCount,
      archived: true,
    });
  }
  console.log(JSON.stringify({ archived: report.length, stores: report }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("migrate-shopify-only failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
