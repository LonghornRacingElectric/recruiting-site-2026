/**
 * Finalize interview-stage rejections that never became final.
 *
 * Before the fix in rejectApplicationFromSystems, an applicant who picked one
 * interview system (which cancels the other pending offers) could never be
 * fully rejected: the cancelled offers counted as live systems, so the picked
 * system's rejection was recorded in rejectedBySystems but status stayed
 * `interview` and interviewDecision was never set. At release_trial those
 * applicants would show "Interview" indefinitely and receive no email.
 *
 * This script writes exactly what the fixed helper would have written for each
 * such application — reviewDecision 'advanced', interviewDecision 'rejected',
 * status 'rejected' — and records one audit entry per application.
 *
 * Selection (re-checked inside each transaction), mirroring the fixed helper's
 * interview-stage branch — only offers whose system is still in the ranking
 * count, and finality means none of those systems is left undecided:
 *   status == interview
 *   no trial offers
 *   at least one interview offer whose system is still in preferredSystems
 *   every such system is in rejectedBySystems
 *
 * Usage (production; refuses to run in an emulator shell):
 *   node scripts/finalize-post-pick-rejections.mjs                 # dry run — lists what would change
 *   node scripts/finalize-post-pick-rejections.mjs --execute       # apply, with audit entries
 *   node scripts/finalize-post-pick-rejections.mjs --execute --actor you@utexas.edu
 *
 * The actor (default matthew.gray.marshall@utexas.edu) must exist in `users`
 * with the admin role; the audit entries are recorded under that account.
 * Deploy the helper fix first, or rejections recorded after this run will
 * stick again.
 */
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (process.env[v]) { console.error(`refusing: ${v} is set. This script targets production; run the regression suite for the emulator.`); process.exit(1); }
}

dotenv.config();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) { console.error("FIREBASE_* credentials missing from .env"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
const db = getFirestore();
// Firestore rejects undefined; the audit snapshots below can carry it.
db.settings({ ignoreUndefinedProperties: true });

const EXECUTE = process.argv.includes("--execute");
const actorArg = process.argv.indexOf("--actor");
const ACTOR_EMAIL = actorArg !== -1 ? process.argv[actorArg + 1] : "matthew.gray.marshall@utexas.edu";
const DETAIL = "backfill: finalize post-pick rejection (cancelled offers blocked finality before the fix, #159)";

const norm = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []);
/** Strip undefined so a partial document can't abort the transaction. */
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
/** Offers whose system is still in the ranking — the only ones finality looks at. */
const rankedOffers = (a) => { const ranked = a.preferredSystems || []; return norm(a.interviewOffers).filter((o) => ranked.includes(o.system)); };
const qualifies = (a) => {
  if (a.status !== "interview" || a.isFakeData) return false;
  if (norm(a.trialOffers).length > 0) return false;
  const offers = rankedOffers(a);
  if (offers.length === 0) return false;
  const rb = a.rejectedBySystems || [];
  return offers.every((o) => rb.includes(o.system));
};
/** Same shape as snapshotApplication() in lib/firebase/audit.ts, so the activity feed renders these like real rejections. */
const snapshot = (a) => clean({
  status: a.status,
  reviewDecision: a.reviewDecision ?? undefined,
  interviewDecision: a.interviewDecision ?? undefined,
  trialDecision: a.trialDecision ?? undefined,
  preferredSystems: a.preferredSystems,
  rejectedBySystems: a.rejectedBySystems,
  interviewOffers: norm(a.interviewOffers).map((o) => `${o.system}:${o.status}`),
  trialOffers: norm(a.trialOffers).map((o) => `${o.system}:${o.status}`),
  selectedInterviewSystem: a.selectedInterviewSystem ?? undefined,
});

async function main() {
  console.log(`project ${process.env.FIREBASE_PROJECT_ID} — ${EXECUTE ? "=== EXECUTE MODE ===" : "=== DRY RUN (no changes) ==="}`);

  const actorSnap = await db.collection("users").where("email", "==", ACTOR_EMAIL).limit(1).get();
  if (actorSnap.empty) { console.error(`actor ${ACTOR_EMAIL} not found in users`); process.exit(1); }
  const actorDoc = actorSnap.docs[0];
  const actorData = actorDoc.data();
  if (actorData.role !== "admin") { console.error(`actor ${ACTOR_EMAIL} is ${actorData.role}, not admin`); process.exit(1); }
  const actor = clean({ uid: actorDoc.id, email: actorData.email, name: actorData.name || actorData.email, role: actorData.role });
  console.log(`actor: ${actor.name} <${actor.email}>`);

  const snap = await db.collection("applications").where("status", "==", "interview").get();
  const targets = snap.docs.filter((d) => qualifies(d.data()));
  const byTeam = {};
  for (const d of targets) { const t = d.data().team; byTeam[t] = (byTeam[t] || 0) + 1; }
  console.log(`interview-stage applications: ${snap.size}; qualifying: ${targets.length} ${JSON.stringify(byTeam)}`);
  for (const d of targets) {
    const a = d.data();
    console.log(`  ${d.id}  ${a.team}  ranked=${(a.preferredSystems || []).join("+")}  offers=${norm(a.interviewOffers).map((o) => `${o.system}:${o.status}`).join("+")}  rejectedBy=${(a.rejectedBySystems || []).join("+")}`);
  }

  if (!EXECUTE) { console.log("\nDry run complete. Re-run with --execute to apply."); return; }

  let applied = 0, skipped = 0, failed = 0;
  for (const d of targets) {
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(d.ref);
        const a = fresh.data();
        if (!a || !qualifies(a)) return "skipped";
        const systems = rankedOffers(a).map((o) => o.system);
        // Exactly the interview-stage branch of the fixed helper at this step:
        // offers preserved, trial offers cleared (already none), decisions set.
        const update = {
          reviewDecision: "advanced",
          interviewDecision: "rejected",
          status: "rejected",
          trialOffers: [],
          updatedAt: FieldValue.serverTimestamp(),
        };
        tx.update(d.ref, update);
        tx.set(db.collection("audit_log").doc(), clean({
          at: FieldValue.serverTimestamp(),
          actor,
          action: "application.reject",
          outcome: "ok",
          applicationId: d.id,
          applicantTeam: a.team,
          systems,
          before: snapshot(a),
          after: snapshot({ ...a, ...update, updatedAt: undefined }),
          detail: DETAIL,
        }));
        return "applied";
      });
      if (outcome === "applied") applied++; else skipped++;
    } catch (err) {
      failed++;
      console.error(`  !! ${d.id}: ${err?.message || err}`);
    }
  }
  console.log(`\napplied ${applied}, skipped ${skipped} (changed under us), failed ${failed}`);
  if (failed) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
