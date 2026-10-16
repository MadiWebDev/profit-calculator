/**
 * Migration: purge legacy raw password-reset tokens (Phase 4).
 *
 * The old schema stored the RAW reset token in `resetPasswordToken`
 * (anyone with DB read access could hijack a reset). Phase 4 switched to
 * `resetPasswordTokenHash` (SHA-256 of the token) + `resetPasswordExpires`.
 *
 * This migration unsets the legacy raw-token field wherever it still
 * exists. Outstanding legacy reset links are invalidated — affected users
 * simply request a new link (forgot-password issues hashed tokens now).
 *
 * Idempotent: only touches users where the legacy field exists; a second
 * run matches nothing.
 *
 * Usage:
 *   npx tsx scripts/migrate-reset-tokens.ts [--dry-run]
 */
import mongoose from "mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");

  const filter = { resetPasswordToken: { $exists: true } };
  const matched = await db.collection("users").countDocuments(filter);
  console.log(`[migrate-reset-tokens] users with legacy raw resetPasswordToken: ${matched}${DRY_RUN ? " (dry run)" : ""}`);

  let modified = 0;
  if (!DRY_RUN && matched > 0) {
    const res = await db
      .collection("users")
      .updateMany(filter, { $unset: { resetPasswordToken: "" } });
    modified = res.modifiedCount;
    console.log(`[migrate-reset-tokens] purged legacy tokens: ${modified}`);
  }

  await mongoose.disconnect();
  console.log("[migrate-reset-tokens] done");
}

main().catch((e) => {
  console.error("[migrate-reset-tokens] failed:", e);
  process.exit(1);
});
