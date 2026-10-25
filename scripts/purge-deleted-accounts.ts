/**
 * Deletion purge (S2.3): hard-delete accounts whose 14-day grace period
 * has expired (deletionScheduledAt < now). Run from cron, NOT from a
 * request handler. --dry-run reports only (default).
 * Order: orders → products → stores → team membership → user. Tokens are
 * wiped first so a partial failure cannot leave a usable credential.
 */
import { connectDB } from "../src/lib/db";

const DRY = !process.argv.includes("--apply");

async function main() {
  await connectDB();
  const { default: UserModel } = await import("../src/models/User");
  const { default: OrderModel } = await import("../src/models/Order");
  const { default: ProductModel } = await import("../src/models/Product");
  const { default: StoreModel } = await import("../src/models/Store");
  const { default: TeamModel } = await import("../src/models/Team");
  const due = await UserModel.find({ deletionScheduledAt: { $lt: new Date() } }).lean();
  console.log(`Accounts past grace period: ${due.length} (dry-run: ${DRY})`);
  for (const user of due) {
    const teamId = user.teamId;
    console.log(`- ${user.email} team=${teamId}`);
    if (DRY) continue;
    if (teamId) {
      await StoreModel.updateMany({ teamId }, { $unset: { accessToken: "", refreshToken: "" } });
      await OrderModel.deleteMany({ teamId });
      await ProductModel.deleteMany({ teamId });
      await StoreModel.deleteMany({ teamId });
      await TeamModel.deleteOne({ _id: teamId });
    }
    await UserModel.deleteOne({ _id: user._id });
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
