/**
 * Finalize interview-stage rejections that never became final (#159).
 *
 * Two shapes, both produced by rejectApplicationFromSystems before the fix:
 *
 * A. "post-pick": the applicant picked one interview system (which cancels the
 *    other pending offers), the picked system rejected them, but the cancelled
 *    offers counted as live systems, so status stayed `interview` and
 *    interviewDecision was never set.
 *
 * B. "advanced-then-rejected": advanced to trial during `interviewing`, then
 *    rejected before release_trial. The trial offers were stripped (the advance
 *    undone) but the helper wrote trialDecision 'rejected' with
 *    interviewDecision still 'advanced', so the applicant reads as a
 *    trial-stage rejection they never attended.
 *
 * At release_trial both shapes would show "Interview" and get no email. This
 * script writes exactly what the fixed helper now writes for each — an
 * interview-stage rejection — and records one audit entry per application.
 *
 * Selection (re-checked inside each transaction):
 *   A: status == interview, no trial offers, at least one interview offer that
 *      still counts (system still in preferredSystems, or offer still pending),
 *      and every counting system is in rejectedBySystems.
 *   B: status == rejected, interviewDecision == 'advanced',
 *      trialDecision == 'rejected', no trial offers. Becomes an interview-stage
 *      rejection, or goes back to `interview` undecided if another system
 *      still holds a live interview offer (same rule as the fixed helper).
 *
 * Usage (production; refuses to run in an emulator shell):
 *   node scripts/finalize-post-pick-rejections.mjs                     # dry run — lists what would change
 *   node scripts/finalize-post-pick-rejections.mjs --execute           # apply, with audit entries
 *   node scripts/finalize-post-pick-rejections.mjs --execute --actor=you@utexas.edu
 *
 * The actor (default matthew.gray.marshall@utexas.edu) must exist in `users`
 * with the admin role; the audit entries are recorded under that account.
 * Deploy the helper fix first, or rejections recorded after this run will
 * stick again. Take a backup first (scripts/qa/sandbox/backup.mjs).
 */
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

dotenv.config();
// After dotenv, so a .env that points at the emulator is caught too — otherwise
// --execute would report "applied" against the emulator while production
// stays untouched.
for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (process.env[v]) { console.error(`refusing: ${v} is set. This script targets production; run the regression suite for the emulator.`); process.exitCode = 1; process.exit(); }
}

const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) { console.error("FIREBASE_* credentials missing from .env"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
const db = getFirestore();
// Firestore rejects undefined; the audit snapshots below can carry it.
db.settings({ ignoreUndefinedProperties: true });

const EXECUTE = process.argv.includes("--execute");
function actorEmailFromArgv() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--actor=")) return args[i].slice("--actor=".length);
    if (args[i] === "--actor") {
      const v = args[i + 1];
      if (!v || v.startsWith("--")) { console.error("--actor needs an email: --actor=you@utexas.edu"); process.exit(1); }
      return v;
    }
  }
  return "matthew.gray.marshall@utexas.edu";
}
const ACTOR_EMAIL = actorEmailFromArgv();
if (!/^[^@\s]+@[^@\s]+$/.test(ACTOR_EMAIL)) { console.error(`actor does not look like an email: ${ACTOR_EMAIL}`); process.exit(1); }

const norm = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []);
/** Strip undefined so a partial document can't abort the transaction. */
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
/** Offers finality still looks at: system still ranked, or offer still pending (same rule as the fixed helper). */
const countingOffers = (a) => { const ranked = a.preferredSystems || []; return norm(a.interviewOffers).filter((o) => ranked.includes(o.system) || o.status === "pending"); };

const SHAPES = {
  A: {
    label: "post-pick: picked system rejected, status still interview",
    detail: "backfill: finalize post-pick rejection (cancelled offers blocked finality before the fix, #159)",
    qualifies: (a) => {
      if (a.status !== "interview" || a.isFakeData) return false;
      if (norm(a.trialOffers).length > 0) return false;
      const offers = countingOffers(a);
      if (offers.length === 0) return false;
      const rb = a.rejectedBySystems || [];
      return offers.every((o) => rb.includes(o.system));
    },
    // Exactly the interview-stage branch of the fixed helper at this step:
    // offers preserved, trial offers cleared (already none), decisions set.
    update: () => ({ reviewDecision: "advanced", interviewDecision: "rejected", status: "rejected", trialOffers: [] }),
    systems: (a) => countingOffers(a).map((o) => o.system),
  },
  B: {
    label: "advanced to trial then rejected before release_trial (reads as a trial-stage rejection)",
    detail: "backfill: relabel pre-release_trial rejection of a trial advance as an interview-stage rejection (#159)",
    qualifies: (a) => a.status === "rejected" && !a.isFakeData && a.interviewDecision === "advanced" && a.trialDecision === "rejected" && norm(a.trialOffers).length === 0,
    // Exactly what the fixed trial branch now writes before release_trial:
    // an interview-stage rejection when no other system still holds a live
    // interview offer, otherwise back to the interview stage, undecided, for
    // that system to finalize.
    update: (a) => {
      const rb = a.rejectedBySystems || [];
      const otherSystemStillDeciding = countingOffers(a).some((o) => !rb.includes(o.system));
      return otherSystemStillDeciding
        ? { reviewDecision: "advanced", status: "interview", interviewDecision: FieldValue.delete(), trialDecision: FieldValue.delete(), trialDecisionDay: FieldValue.delete() }
        : { reviewDecision: "advanced", interviewDecision: "rejected", trialDecision: FieldValue.delete(), trialDecisionDay: FieldValue.delete() };
    },
    systems: (a) => a.rejectedBySystems || [],
  },
};

/** Same shape as snapshotApplication() in lib/firebase/audit.ts, so the activity feed renders these like real rejections. */
const snapshot = (a) => clean({
  status: a.status,
  reviewDecision: a.reviewDecision ?? undefined,
  interviewDecision: a.interviewDecision ?? undefined,
  trialDecision: a.trialDecision ?? undefined,
  trialDecisionDay: a.trialDecisionDay ?? undefined,
  preferredSystems: a.preferredSystems,
  rejectedBySystems: a.rejectedBySystems,
  interviewOffers: norm(a.interviewOffers).map((o) => `${o.system}:${o.status}`),
  trialOffers: norm(a.trialOffers).map((o) => `${o.system}:${o.status}`),
  selectedInterviewSystem: a.selectedInterviewSystem ?? undefined,
});
/** The post-write document as the audit "after" — deletes become absent fields. */
const applyForSnapshot = (a, update) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(update)) { if (v && typeof v === "object" && v.constructor?.name === "DeleteTransform") delete out[k]; else if (v instanceof FieldValue) delete out[k]; else out[k] = v; }
  return out;
};

async function main() {
  console.log(`project ${process.env.FIREBASE_PROJECT_ID} — ${EXECUTE ? "=== EXECUTE MODE ===" : "=== DRY RUN (no changes) ==="}`);

  const actorSnap = await db.collection("users").where("email", "==", ACTOR_EMAIL).limit(1).get();
  if (actorSnap.empty) { console.error(`actor ${ACTOR_EMAIL} not found in users`); process.exitCode = 1; return; }
  const actorDoc = actorSnap.docs[0];
  const actorData = actorDoc.data();
  if (actorData.role !== "admin") { console.error(`actor ${ACTOR_EMAIL} is ${actorData.role}, not admin`); process.exitCode = 1; return; }
  const actor = clean({ uid: actorDoc.id, email: actorData.email, name: actorData.name || actorData.email, role: actorData.role });
  console.log(`actor: ${actor.name} <${actor.email}>`);

  const [interviewSnap, rejectedSnap] = await Promise.all([
    db.collection("applications").where("status", "==", "interview").get(),
    db.collection("applications").where("status", "==", "rejected").get(),
  ]);
  const groups = [
    { key: "A", shape: SHAPES.A, docs: interviewSnap.docs.filter((d) => SHAPES.A.qualifies(d.data())), scanned: interviewSnap.size },
    { key: "B", shape: SHAPES.B, docs: rejectedSnap.docs.filter((d) => SHAPES.B.qualifies(d.data())), scanned: rejectedSnap.size },
  ];
  for (const g of groups) {
    const byTeam = {};
    for (const d of g.docs) { const t = d.data().team; byTeam[t] = (byTeam[t] || 0) + 1; }
    console.log(`\n[${g.key}] ${g.shape.label}\n    scanned ${g.scanned}; qualifying: ${g.docs.length} ${JSON.stringify(byTeam)}`);
    for (const d of g.docs) {
      const a = d.data();
      const u = g.shape.update(a);
      console.log(`    ${d.id}  ${a.team}  ranked=${(a.preferredSystems || []).join("+")}  offers=${norm(a.interviewOffers).map((o) => `${o.system}:${o.status}`).join("+")}  rejectedBy=${(a.rejectedBySystems || []).join("+")}  id=${a.interviewDecision ?? "-"} td=${a.trialDecision ?? "-"}  ->  status=${u.status ?? a.status} id=${typeof u.interviewDecision === "string" ? u.interviewDecision : "(cleared)"}`);
    }
  }

  if (!EXECUTE) { console.log("\nDry run complete. Re-run with --execute to apply."); return; }

  let applied = 0, skipped = 0, failed = 0;
  for (const g of groups) {
    for (const d of g.docs) {
      try {
        const outcome = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(d.ref);
          const a = fresh.data();
          if (!a || !g.shape.qualifies(a)) return "skipped";
          const update = g.shape.update(a);
          tx.update(d.ref, { ...update, updatedAt: FieldValue.serverTimestamp() });
          tx.set(db.collection("audit_log").doc(), clean({
            at: FieldValue.serverTimestamp(),
            actor,
            action: "application.reject",
            outcome: "ok",
            applicationId: d.id,
            applicantTeam: a.team,
            systems: g.shape.systems(a),
            before: snapshot(a),
            after: snapshot(applyForSnapshot(a, update)),
            detail: g.shape.detail,
          }));
          return "applied";
        });
        if (outcome === "applied") applied++; else skipped++;
      } catch (err) {
        failed++;
        console.error(`    !! [${g.key}] ${d.id}: ${err?.message || err}`);
      }
    }
  }
  console.log(`\napplied ${applied}, skipped ${skipped} (changed under us), failed ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
