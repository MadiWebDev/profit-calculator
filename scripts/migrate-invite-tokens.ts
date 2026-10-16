/**
 * Migration: purge legacy raw invite tokens (Phase 3/4).
 *
 * The old schema stored the RAW invite token in `members[].inviteToken`.
 * Phase 3 switched to `members[].inviteTokenHash` (SHA-256 of the token).
 *
 * This migration unsets the legacy raw-token field on any team member
 * subdocument where it still exists. Outstanding legacy invite links are
 * invalidated — owners simply re-send the invite (resend issues a hashed
 * token now).
 *
 * Idempotent: only touches members where the legacy field exists; a second
 * run matches nothing.
 *
 * Usage:
 *   npx tsx scripts/migrate-invite-tokens.ts [--dry-run]
 */
import mongoose from "mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");

  const filter = { "members.inviteToken": { $exists: true } };
  const matched = await db.collection("teams").countDocuments(filter);
  console.log(`[migrate-invite-tokens] teams with legacy raw members.inviteToken: ${matched}${DRY_RUN ? " (dry run)" : ""}`);

  let modified = 0;
  if (!DRY_RUN && matched > 0) {
    const res = await db
      .collection("teams")
      .updateMany(filter, { $unset: { "members.$[].inviteToken": "" } });
    modified = res.modifiedCount;
    console.log(`[migrate-invite-tokens] purged legacy tokens on teams: ${modified}`);
  }

  await mongoose.disconnect();
  console.log("[migrate-invite-tokens] done");
}

main().catch((e) => {
  console.error("[migrate-invite-tokens] failed:", e);
  process.exit(1);
});
