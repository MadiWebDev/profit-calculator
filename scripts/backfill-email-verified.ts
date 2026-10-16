/**
 * Migration: grandfather email verification for pre-existing users (Phase 4).
 *
 * Credential login now requires a verified email, but email verification
 * links were only introduced in Phase 4 — every account created before this
 * would otherwise be locked out on next login.
 *
 * Rule: credential users (password set) with no emailVerified get
 * emailVerified := createdAt. Google OAuth users are verified at creation
 * already; users without a password are untouched.
 *
 * Idempotent: only touches users where emailVerified is missing; a second
 * run matches nothing.
 *
 * Usage:
 *   npx tsx scripts/backfill-email-verified.ts [--dry-run]
 */
import mongoose from "mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");

  const filter = {
    password: { $exists: true, $ne: null },
    emailVerified: { $exists: false },
  };

  const matched = await db.collection("users").countDocuments(filter);
  console.log(`[backfill-email-verified] matched users: ${matched}${DRY_RUN ? " (dry run)" : ""}`);

  let modified = 0;
  if (!DRY_RUN && matched > 0) {
    // Aggregation-pipeline update: copy each user's own createdAt.
    const res = await db.collection("users").updateMany(filter, [
      { $set: { emailVerified: "$createdAt" } },
    ]);
    modified = res.modifiedCount;
    console.log(`[backfill-email-verified] modified users: ${modified}`);
  }

  await mongoose.disconnect();
  console.log("[backfill-email-verified] done");
}

main().catch((e) => {
  console.error("[backfill-email-verified] failed:", e);
  process.exit(1);
});
