/**
 * Pre-cycle data wipe (#2).
 *
 * Deletes, per PM (2026-08-05):
 *   - ALL applications + their subcollections (notes, tasks, scorecards,
 *     interviewScorecards)
 *   - ALL non-admin user accounts (test accounts were promoted to staff roles
 *     they don't actually hold — only real admins survive)
 *   - ALL uploaded files under resumes/ and portfolios/ in Storage
 *   - the orphaned calendarSlotLocks collection and tokens/google_calendar doc
 *
 * Keeps: admin users, everything under config/, interviewConfigs,
 * scorecardConfigs.
 *
 * Usage:
 *   node scripts/wipe-cycle-data.mjs             # dry run — prints manifest only
 *   node scripts/wipe-cycle-data.mjs --execute   # backup to Downloads, then delete
 *
 * The backup covers all Firestore docs being deleted (including subcollections).
 * Storage files are NOT backed up (test resumes/portfolios, per Gray) — they are
 * unrecoverable after --execute.
 */
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

dotenv.config();
admin.initializeApp({
  credential: admin.credential.cert({
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    projectId: process.env.FIREBASE_PROJECT_ID,
  }),
  storageBucket: "lhr-recruiting-2026.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const EXECUTE = process.argv.includes("--execute");

const SUBCOLLECTIONS = ["notes", "tasks", "scorecards", "interviewScorecards"];

async function main() {
  console.log(EXECUTE ? "=== EXECUTE MODE ===" : "=== DRY RUN (no changes) ===");

  // ---- inventory ----
  const users = await db.collection("users").get();
  const keepUsers = [];
  const deleteUsers = [];
  users.forEach((d) => {
    (d.data().role === "admin" ? keepUsers : deleteUsers).push(d);
  });

  const apps = await db.collection("applications").get();

  let subCounts = {};
  for (const sub of SUBCOLLECTIONS) {
    const agg = await db.collectionGroup(sub).count().get();
    subCounts[sub] = agg.data().count;
  }

  const locks = await db.collection("calendarSlotLocks").get();
  const tokenDoc = await db.collection("tokens").doc("google_calendar").get();

  const [resumeFiles] = await bucket.getFiles({ prefix: "resumes/" });
  const [portfolioFiles] = await bucket.getFiles({ prefix: "portfolios/" });

  console.log("\n--- MANIFEST ---");
  console.log(`users to DELETE: ${deleteUsers.length}`);
  const byRole = {};
  deleteUsers.forEach((d) => {
    const r = d.data().role || "(unset)";
    byRole[r] = (byRole[r] || 0) + 1;
  });
  console.log(`  by role: ${JSON.stringify(byRole)}`);
  console.log(`users to KEEP (admins): ${keepUsers.length}`);
  keepUsers.forEach((d) => console.log(`  keep: ${d.data().email} (${d.data().name})`));
  console.log(`applications to DELETE: ${apps.size}`);
  for (const [k, v] of Object.entries(subCounts)) console.log(`  subcollection ${k}: ${v} docs`);
  console.log(`calendarSlotLocks to DELETE: ${locks.size}`);
  console.log(`tokens/google_calendar: ${tokenDoc.exists ? "DELETE" : "not present"}`);
  console.log(`storage resumes/ files to DELETE: ${resumeFiles.length}`);
  console.log(`storage portfolios/ files to DELETE: ${portfolioFiles.length}`);
  console.log("KEEPING: config/*, interviewConfigs, scorecardConfigs, admin users");

  if (!EXECUTE) {
    console.log("\nDry run complete. Re-run with --execute to wipe.");
    return;
  }

  // ---- backup ----
  const stamp = new Date().toISOString().slice(0, 10);
  const backupDir = path.join("C:", "Users", "Gray", "Downloads", `lhr-wipe-backup-${stamp}`);
  mkdirSync(backupDir, { recursive: true });

  console.log("\n--- BACKUP ---");
  const backupUsers = {};
  deleteUsers.forEach((d) => (backupUsers[d.id] = d.data()));
  writeFileSync(path.join(backupDir, "users.json"), JSON.stringify(backupUsers, null, 1));

  const backupApps = {};
  for (const appDoc of apps.docs) {
    const entry = { data: appDoc.data(), sub: {} };
    for (const sub of SUBCOLLECTIONS) {
      const snap = await appDoc.ref.collection(sub).get();
      if (!snap.empty) {
        entry.sub[sub] = {};
        snap.forEach((s) => (entry.sub[sub][s.id] = s.data()));
      }
    }
    backupApps[appDoc.id] = entry;
  }
  writeFileSync(path.join(backupDir, "applications.json"), JSON.stringify(backupApps, null, 1));

  const backupMisc = { calendarSlotLocks: {}, tokens: {} };
  locks.forEach((d) => (backupMisc.calendarSlotLocks[d.id] = d.data()));
  if (tokenDoc.exists) backupMisc.tokens.google_calendar = tokenDoc.data();
  writeFileSync(path.join(backupDir, "misc.json"), JSON.stringify(backupMisc, null, 1));
  console.log(`backup written to ${backupDir}`);

  // ---- delete ----
  console.log("\n--- DELETING ---");
  let n = 0;
  for (const appDoc of apps.docs) {
    await db.recursiveDelete(appDoc.ref);
    n++;
    if (n % 100 === 0) console.log(`  applications: ${n}/${apps.size}`);
  }
  console.log(`applications deleted: ${n}`);

  n = 0;
  for (const d of deleteUsers) {
    await d.ref.delete();
    n++;
    if (n % 200 === 0) console.log(`  users: ${n}/${deleteUsers.length}`);
  }
  console.log(`users deleted: ${n}`);

  n = 0;
  for (const d of locks.docs) {
    await d.ref.delete();
    n++;
  }
  console.log(`calendarSlotLocks deleted: ${n}`);

  if (tokenDoc.exists) {
    await tokenDoc.ref.delete();
    console.log("tokens/google_calendar deleted");
  }

  if (resumeFiles.length) {
    await bucket.deleteFiles({ prefix: "resumes/" });
    console.log(`storage resumes/ deleted (${resumeFiles.length} files)`);
  }
  if (portfolioFiles.length) {
    await bucket.deleteFiles({ prefix: "portfolios/" });
    console.log(`storage portfolios/ deleted (${portfolioFiles.length} files)`);
  }

  console.log("\nWipe complete.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
