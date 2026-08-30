// Production, READ ONLY: a fingerprint that changes if anything is written.
// Run before and after a sandbox session and diff the two outputs.
//   node scripts/qa/sandbox/fingerprint.mjs > before.json
import { prodApp } from "./common.mjs";

const { db, projectId } = prodApp("fingerprint");
const out = { projectId, takenAt: new Date().toISOString(), collections: {} };
for (const col of ["applications", "users", "config", "interviewConfigs", "scorecardConfigs", "audit_log", "tokens", "calendarSlotLocks"]) {
  const count = (await db.collection(col).count().get()).data().count;
  out.collections[col] = { count };
}
for (const col of ["applications", "users"]) {
  const latest = await db.collection(col).orderBy("updatedAt", "desc").limit(1).get();
  out.collections[col].latestUpdatedAt = latest.docs[0]?.data().updatedAt?.toDate?.()?.toISOString?.() ?? null;
  out.collections[col].latestUpdatedId = latest.docs[0]?.id ?? null;
}
const latestAudit = await db.collection("audit_log").orderBy("at", "desc").limit(1).get();
out.collections.audit_log.latestAt = latestAudit.docs[0]?.data().at?.toDate?.()?.toISOString?.() ?? null;
out.collections.audit_log.latestId = latestAudit.docs[0]?.id ?? null;
for (const name of ["config", "interviewConfigs", "scorecardConfigs"]) {
  const snap = await db.collection(name).get();
  out.collections[name].docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().updatedAt?.toDate?.()?.toISOString?.() ?? (d.updateTime?.toDate?.()?.toISOString?.() ?? null)]));
}
for (const name of ["notes", "tasks", "scorecards", "interviewScorecards"]) {
  out.collections[`applications/*/${name}`] = { count: (await db.collectionGroup(name).count().get()).data().count };
}
// takenAt is deliberately excluded from the comparable part; diff `comparable` only.
const { takenAt, ...comparable } = out;
console.log(JSON.stringify({ takenAt, comparable }, null, 2));
