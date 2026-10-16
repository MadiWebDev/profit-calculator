/**
 * Migration: split platform role from team role (Phase 3).
 *
 *  - User.platformRole: "superAdmin" when legacy role === "superAdmin", else "user".
 *  - Team.members[].role: already "owner" everywhere (the only value the old
 *    enum allowed) — validated, no change needed.
 *
 * Idempotent: only writes when platformRole is missing or inconsistent.
 * Usage:
 *   npx tsx scripts/migrate-roles.ts [--dry-run]
 *   (or: node --experimental-strip-types scripts/migrate-roles.ts --dry-run)
 */
import mongoose from "mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");

  let usersScanned = 0;
  let usersUpdated = 0;
  let usersAlreadyOk = 0;

  const cursor = db.collection("users").find({});
  for await (const user of cursor) {
    usersScanned++;
    const expected = user.role === "superAdmin" ? "superAdmin" : "user";
    if (user.platformRole === expected) {
      usersAlreadyOk++;
      continue;
    }
    if (!DRY_RUN) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { platformRole: expected } }
      );
    }
    usersUpdated++;
  }

  // Validate team member roles (old enum only allowed "owner")
  let teamsScanned = 0;
  let badRoles = 0;
  const teamCursor = db.collection("teams").find({});
  for await (const team of teamCursor) {
    teamsScanned++;
    for (const m of team.members ?? []) {
      if (!["owner", "admin", "member", "viewer"].includes(m.role)) badRoles++;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        users: { scanned: usersScanned, updated: usersUpdated, alreadyOk: usersAlreadyOk },
        teams: { scanned: teamsScanned, invalidMemberRoles: badRoles },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("migrate-roles failed:", e);
  process.exit(1);
});
