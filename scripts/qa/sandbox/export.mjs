// Production -> local snapshot. READ ONLY: every call on the production handle
// below is a .get(). Refuses to run in an emulator shell.
//   node scripts/qa/sandbox/export.mjs
import { writeFileSync } from "node:fs";
import { prodApp, serialize, ensureSandboxDir, SNAPSHOT_FILE } from "./common.mjs";

const { db, projectId } = prodApp("export");
ensureSandboxDir();
const t0 = Date.now();
const snapshot = { projectId, exportedAt: new Date().toISOString(), collections: {}, subcollections: {} };

for (const col of ["applications", "users", "config", "interviewConfigs", "scorecardConfigs", "audit_log"]) {
  const snap = await db.collection(col).get();
  snapshot.collections[col] = snap.docs.map((d) => ({ id: d.id, data: serialize(d.data()) }));
  console.log(`${col.padEnd(18)} ${String(snap.size).padStart(6)} docs`);
}
for (const name of ["notes", "tasks", "scorecards", "interviewScorecards"]) {
  const snap = await db.collectionGroup(name).get();
  snapshot.subcollections[name] = snap.docs.map((d) => ({ path: d.ref.path, data: serialize(d.data()) }));
  console.log(`${("*/" + name).padEnd(18)} ${String(snap.size).padStart(6)} docs`);
}
const json = JSON.stringify(snapshot);
writeFileSync(SNAPSHOT_FILE, json);
console.log(`\nwrote ${SNAPSHOT_FILE} (${(json.length / 1e6).toFixed(1)} MB) in ${Math.round((Date.now() - t0) / 1000)}s — this file holds applicant PII; import.mjs --purge deletes it`);
