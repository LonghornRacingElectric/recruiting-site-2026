// Snapshot -> local emulator. Emulator only: refuses to run without both
// emulator variables, initialises with the demo project id and no credentials.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/sandbox/import.mjs [--purge]
// --purge deletes the snapshot file afterwards (it holds applicant PII).
import { readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { emulatorApp, deserialize, SNAPSHOT_FILE, EMULATOR_PROJECT_ID, SANDBOX_MARKER } from "./common.mjs";

const { db, auth } = emulatorApp("import");
if (!existsSync(SNAPSHOT_FILE)) { console.error(`no snapshot at ${SNAPSHOT_FILE} — run export.mjs first (in a shell WITHOUT the emulator vars)`); process.exit(1); }
const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
console.log(`snapshot of ${snapshot.projectId} taken ${snapshot.exportedAt}`);
const t0 = Date.now();

// 1. wipe the emulator (Firestore documents and Auth accounts)
const fsHost = process.env.FIRESTORE_EMULATOR_HOST, authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let r = await fetch(`http://${fsHost}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
if (!r.ok) { console.error("firestore wipe failed", r.status); process.exit(1); }
r = await fetch(`http://${authHost}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`, { method: "DELETE" });
if (!r.ok) { console.error("auth wipe failed", r.status); process.exit(1); }
console.log("emulator wiped");

// 2. load documents in batches
let written = 0;
async function writeAll(items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    for (const { ref, data } of items.slice(i, i + 400)) batch.set(ref, deserialize(data, db));
    await batch.commit();
    written += Math.min(400, items.length - i);
  }
}
for (const [col, docs] of Object.entries(snapshot.collections)) {
  // never import a live email-run lock — it would 409 the report's dry run
  const usable = col === "config" ? docs.filter((d) => d.id !== "email_run_lock") : docs;
  await writeAll(usable.map((d) => ({ ref: db.collection(col).doc(d.id), data: d.data })));
  console.log(`${col.padEnd(18)} ${String(docs.length).padStart(6)} docs`);
}
for (const [name, docs] of Object.entries(snapshot.subcollections)) {
  await writeAll(docs.map((d) => ({ ref: db.doc(d.path), data: d.data })));
  console.log(`${("*/" + name).padEnd(18)} ${String(docs.length).padStart(6)} docs`);
}

// 3. belt and braces on email: the dev server has no SES credentials locally, and
//    the cloned templates are switched off too, so the email run reports
//    globally_disabled for everyone instead of attempting anything.
await db.doc("config/email_templates").set({ globalEnabled: false, sandboxNote: "disabled by scripts/qa/sandbox/import.mjs" }, { merge: true });

// 4. Auth accounts for every real user, same uid and email, so any of them can
//    be signed in as through the emulator's fake IdP (no real credential involved).
const users = snapshot.collections.users || [];
let imported = 0, failed = 0;
for (let i = 0; i < users.length; i += 900) {
  const chunk = users.slice(i, i + 900).filter((u) => u.data.email).map((u) => ({
    uid: u.id, email: u.data.email, emailVerified: true, displayName: u.data.name || u.data.email,
    providerData: [{ uid: u.data.email, email: u.data.email, displayName: u.data.name || u.data.email, providerId: "google.com" }],
  }));
  const res = await auth.importUsers(chunk);
  imported += res.successCount; failed += res.failureCount;
  for (const e of res.errors.slice(0, 3)) console.log("  auth import error:", e.index, e.error?.message);
}
console.log(`auth accounts: ${imported} imported, ${failed} failed`);
console.log(`\ndone: ${written} documents in ${Math.round((Date.now() - t0) / 1000)}s; email templates globally disabled in the sandbox`);
if (process.argv.includes("--purge")) {
  // the snapshot, the rendered emails (real names/addresses) and the reports.
  // SANDBOX_DIR is caller-controlled, so refuse to delete any directory this
  // tooling didn't mark — pointing it at ~ and purging must not cost a home dir.
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!existsSync(path.join(dir, SANDBOX_MARKER))) {
    console.error(`refusing --purge: ${dir} has no ${SANDBOX_MARKER} marker — not a directory this tooling owns`);
    process.exit(1);
  }
  for (const entry of readdirSync(dir)) rmSync(path.join(dir, entry), { recursive: true, force: true });
  console.log(`purged everything in ${dir}`);
}
