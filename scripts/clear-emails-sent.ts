/**
 * Script to clear the emailsSent array from all applications.
 *
 * Run with:  npx tsx scripts/clear-emails-sent.ts [--dry-run]
 *
 * Reads FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID
 * from the .env file in the project root.
 */

// Load env before anything else
import * as dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const DRY_RUN = process.argv.includes("--dry-run");
let changeCount = 0;

async function clearEmailsSent() {
  console.log("\n=== Clearing emailsSent array from applications ===");
  const snap = await db.collection("applications").get();
  console.log(`Found ${snap.size} applications`);

  for (const doc of snap.docs) {
    const data = doc.data();
    
    // Only update if emailsSent exists and is not already empty
    if (data.emailsSent && Array.isArray(data.emailsSent) && data.emailsSent.length > 0) {
      changeCount++;
      console.log(`  [APP] ${doc.id}: clearing ${data.emailsSent.length} sent emails`);
      
      if (!DRY_RUN) {
        await doc.ref.update({
          emailsSent: [],
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  }
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes" : "🔧 LIVE RUN — will write to Firestore");

  await clearEmailsSent();

  console.log(`\n✅ Done. ${changeCount} application(s) ${DRY_RUN ? "would be" : "were"} updated.`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
