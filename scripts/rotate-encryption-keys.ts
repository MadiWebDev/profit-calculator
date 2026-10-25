/**
 * Key rotation (S2.1): re-encrypt tokens/courier keys from legacy
 * CryptoJS format (or an old GCM key version) to the CURRENT GCM key.
 * Usage:
 *   npx tsx scripts/rotate-encryption-keys.ts --dry-run   (default: report only)
 *   npx tsx scripts/rotate-encryption-keys.ts --apply     (writes)
 * Zero downtime: decryptAny() reads both formats, so reads keep working
 * while rows are migrated one by one; a failed row is logged and skipped,
 * never blanked. Requires ENCRYPTION_KEYS_JSON with the new current key
 * AND the old key (or ENCRYPTION_KEY for legacy rows).
 */
import { connectDB } from "../src/lib/db";
import { decryptAny, encryptV2, isV2Ciphertext, loadKeyring } from "../src/lib/encryption-v2";

const DRY = !process.argv.includes("--apply");

async function main() {
  await connectDB();
  const keyring = loadKeyring();
  if (!keyring.current) {
    console.error("No current encryption key configured. Set ENCRYPTION_KEYS_JSON.");
    process.exit(2);
  }
  console.log(`Current key: ${keyring.current} (dry-run: ${DRY})`);
  // Dynamically import models to avoid loading the whole app in this script.
  const { default: StoreModel } = await import("../src/models/Store");
  const { default: AdAccountModel } = await import("../src/models/AdAccount");
  const { default: CourierModel } = await import("../src/models/Courier");
  const { default: UserModel } = await import("../src/models/User");

  const jobs: Array<{ model: string; query: object; fields: string[] }> = [
    { model: "Store", query: {}, fields: ["accessToken", "refreshToken"] },
    { model: "AdAccount", query: {}, fields: ["accessToken", "refreshToken"] },
    { model: "Courier", query: {}, fields: ["apiKey"] },
    { model: "User", query: { twoFactorSecretEncrypted: { $exists: true, $ne: null } }, fields: ["twoFactorSecretEncrypted"] },
  ];
  const models: Record<string, { find: (q: object) => { lean: () => Promise<Record<string, unknown>[]> }; updateOne: (f: object, u: object) => Promise<unknown> }> = {
    Store: StoreModel as never, AdAccount: AdAccountModel as never, Courier: CourierModel as never, User: UserModel as never,
  };
  let scanned = 0, migrated = 0, skipped = 0, failed = 0;
  for (const job of jobs) {
    const model = models[job.model];
    const rows = await model.find(job.query).lean();
    for (const row of rows) {
      for (const field of job.fields) {
        const val = row[field] as string | undefined;
        if (!val) continue;
        scanned++;
        const plain = decryptAny(val, keyring);
        if (plain === null) { failed++; console.log(`FAIL ${job.model} ${row._id} ${field}: undecryptable`); continue; }
        const alreadyCurrent = isV2Ciphertext(val) && val.split(":")[1] === keyring.current;
        if (alreadyCurrent) { skipped++; continue; }
        if (!DRY) {
          await model.updateOne({ _id: row._id }, { $set: { [field]: encryptV2(plain, keyring) } });
        }
        migrated++;
      }
    }
  }
  console.log(JSON.stringify({ scanned, migrated, skipped, failed, dryRun: DRY }));
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
