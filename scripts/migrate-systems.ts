/**
 * Migration script to rename/add systems in Firestore after enum changes.
 *
 * Changes:
 *   Electric:    "Software" → "VMod",  add "Trackside Engineering"
 *   Solar:       remove "Powertrain" (rename reference if it exists)
 *   Combustion:  "Sim/AI" → "Sim/Val", add "Manufacturing"
 *
 * Run with:  npx tsx scripts/migrate-systems.ts [--dry-run]
 *
 * Reads FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID
 * from the .env file in the project root.
 */

// Load env before anything else
import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ─── Initialise Firebase Admin ────────────────────────────────────────────────
if (getApps().length === 0) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!clientEmail || !privateKey || !projectId) {
    console.error("Missing required env vars: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID");
    console.error("Make sure they are defined in your .env file.");
    process.exit(1);
  }

  initializeApp({
    credential: cert({ clientEmail, privateKey, projectId }),
  });
}
const db = getFirestore();

// ─── Rename map ───────────────────────────────────────────────────────────────
const RENAMES: Record<string, string> = {
  Software: "VMod",
  "Sim/AI": "Sim/Val",
};

const DRY_RUN = process.argv.includes("--dry-run");
let changeCount = 0;

function rename(val: string): string {
  return RENAMES[val] ?? val;
}

function renameArray(arr: string[]): string[] {
  return arr.map(rename);
}

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ─── 1. Migrate applications ─────────────────────────────────────────────────
async function migrateApplications() {
  console.log("\n=== Migrating applications ===");
  const snap = await db.collection("applications").get();
  console.log(`Found ${snap.size} applications`);

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates: Record<string, unknown> = {};

    // preferredSystems
    if (Array.isArray(data.preferredSystems)) {
      const updated = renameArray(data.preferredSystems);
      if (changed(data.preferredSystems, updated)) {
        updates.preferredSystems = updated;
      }
    }

    // interviewOffers[].system
    if (Array.isArray(data.interviewOffers)) {
      const updated = data.interviewOffers.map((o: Record<string, unknown>) => ({
        ...o,
        system: rename(o.system as string),
      }));
      if (changed(data.interviewOffers, updated)) {
        updates.interviewOffers = updated;
      }
    }

    // trialOffers[].system
    if (Array.isArray(data.trialOffers)) {
      const updated = data.trialOffers.map((o: Record<string, unknown>) => ({
        ...o,
        system: rename(o.system as string),
      }));
      if (changed(data.trialOffers, updated)) {
        updates.trialOffers = updated;
      }
    }

    // rejectedBySystems
    if (Array.isArray(data.rejectedBySystems)) {
      const updated = renameArray(data.rejectedBySystems);
      if (changed(data.rejectedBySystems, updated)) {
        updates.rejectedBySystems = updated;
      }
    }

    // selectedInterviewSystem
    if (data.selectedInterviewSystem && RENAMES[data.selectedInterviewSystem]) {
      updates.selectedInterviewSystem = rename(data.selectedInterviewSystem);
    }

    // aggregateRatings (keyed by system name)
    if (data.aggregateRatings && typeof data.aggregateRatings === "object") {
      const oldKeys = Object.keys(data.aggregateRatings);
      const needsUpdate = oldKeys.some((k) => RENAMES[k]);
      if (needsUpdate) {
        const newRatings: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data.aggregateRatings)) {
          newRatings[rename(k)] = v;
        }
        updates.aggregateRatings = newRatings;
      }
    }

    // offer.system
    if (data.offer?.system && RENAMES[data.offer.system]) {
      updates.offer = { ...data.offer, system: rename(data.offer.system) };
    }

    if (Object.keys(updates).length > 0) {
      changeCount++;
      console.log(`  [APP] ${doc.id}: ${Object.keys(updates).join(", ")}`);
      if (!DRY_RUN) {
        await doc.ref.update(updates);
      }
    }
  }
}

// ─── 2. Migrate users (memberProfile.system) ────────────────────────────────
async function migrateUsers() {
  console.log("\n=== Migrating users ===");
  const snap = await db.collection("users").get();
  console.log(`Found ${snap.size} users`);

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.memberProfile?.system && RENAMES[data.memberProfile.system]) {
      changeCount++;
      const newSys = rename(data.memberProfile.system);
      console.log(`  [USER] ${doc.id}: ${data.memberProfile.system} → ${newSys}`);
      if (!DRY_RUN) {
        await doc.ref.update({ "memberProfile.system": newSys });
      }
    }
  }
}

// ─── 3. Migrate teams config (subsystem names) ──────────────────────────────
async function migrateTeamsConfig() {
  console.log("\n=== Migrating teams config ===");
  const doc = await db.collection("config").doc("teams").get();
  if (!doc.exists) {
    console.log("  No teams config document found — will use defaults from enum");
    return;
  }

  const data = doc.data()!;
  const teams = data.teams as Record<string, Record<string, unknown>> | undefined;
  if (!teams) return;

  let dirty = false;
  const updatedTeams = { ...teams };

  for (const [teamKey, teamData] of Object.entries(updatedTeams)) {
    const subsystems = teamData.subsystems as Array<Record<string, unknown>> | undefined;
    if (!subsystems) continue;

    const updatedSubs = subsystems.map((sub) => {
      const oldName = sub.name as string;
      const newName = rename(oldName);
      if (oldName !== newName) {
        dirty = true;
        console.log(`  [TEAM ${teamKey}] Subsystem: ${oldName} → ${newName}`);
        return { ...sub, name: newName };
      }
      return sub;
    });

    updatedTeams[teamKey] = { ...teamData, subsystems: updatedSubs };
  }

  if (dirty) {
    changeCount++;
    if (!DRY_RUN) {
      await doc.ref.update({ teams: updatedTeams });
    }
  }
}

// ─── 4. Migrate interview configs (document IDs contain system name) ────────
async function migrateInterviewConfigs() {
  console.log("\n=== Migrating interview configs ===");
  const snap = await db.collection("interviewConfigs").get();
  console.log(`Found ${snap.size} interview configs`);

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.system && RENAMES[data.system]) {
      changeCount++;
      const newSys = rename(data.system);
      console.log(`  [INTERVIEW] ${doc.id}: ${data.system} → ${newSys}`);
      if (!DRY_RUN) {
        await doc.ref.update({ system: newSys });
      }
    }
  }
}

// ─── 5. Migrate scorecards ──────────────────────────────────────────────────
async function migrateScorecards() {
  console.log("\n=== Migrating scorecards ===");
  const snap = await db.collection("scorecards").get();
  console.log(`Found ${snap.size} scorecards`);

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.system && RENAMES[data.system]) {
      changeCount++;
      const newSys = rename(data.system);
      console.log(`  [SCORECARD] ${doc.id}: ${data.system} → ${newSys}`);
      if (!DRY_RUN) {
        await doc.ref.update({ system: newSys });
      }
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes" : "🔧 LIVE RUN — will write to Firestore");
  console.log("Renames:", RENAMES);

  await migrateApplications();
  await migrateUsers();
  await migrateTeamsConfig();
  await migrateInterviewConfigs();
  await migrateScorecards();

  console.log(`\n✅ Done. ${changeCount} document(s) ${DRY_RUN ? "would be" : "were"} updated.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
