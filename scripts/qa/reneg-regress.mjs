// Reneg / commit semantics (#8, PR #141): a commit declines only offers the
// applicant has actually been shown — an acceptance stamped for a later
// decision day survives, surfaces on its own day, can be taken as a reneg
// (prior commitment flips to rejected) or expires on the next advance. The
// Decline button's path records a decline without touching anything else.
// With reneg switched off, the old decline-everything behaviour stands.
// Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/reneg-regress.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) { if (!process.env[v]) { console.error(`refusing: ${v} not set`); process.exit(1); } }
admin.initializeApp({ projectId: "demo-lhr-recruiting" });
const db = getFirestore(); const auth = admin.auth();
const BASE = "http://localhost:3000";
const IDP = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };
async function ensureUser({ uid, email, name, role }) {
  try { await auth.importUsers([{ uid, email, emailVerified: true, displayName: name, providerData: [{ uid: email, email, displayName: name, providerId: "google.com" }] }]); } catch {}
  await db.doc(`users/${uid}`).set({ uid, email, name, role, blacklisted: false, applications: [], phoneNumber: null, isMember: false }, { merge: true });
}
async function session(email) {
  const r1 = await fetch(IDP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postBody: "id_token=" + encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true, name: email })) + "&providerId=google.com", requestUri: BASE, returnSecureToken: true }) });
  const j1 = await r1.json(); if (!j1.idToken) throw new Error("idp failed");
  const r2 = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: j1.idToken }) });
  if (r2.status !== 200) throw new Error(`session ${email} -> ${r2.status}`);
  return r2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
async function api(cookie, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}
const now = () => new Date();
const get = async (id) => (await db.doc(`applications/${id}`).get()).data();
const setStep = (c, step) => api(c, "POST", "/api/admin/config/recruiting", { step, confirm: step });
const err = (r) => `${r.status} ${r.json?.error || ""}`;
const accepted = (uid, email, team, system, day) => ({ userId: uid, userEmail: email, userName: email, team, preferredSystems: [system], status: "accepted", reviewDecision: "advanced", interviewDecision: "advanced", trialDecision: "advanced", trialDecisionDay: day, offer: { system, role: "Member", issuedAt: now() }, formData: { whyJoin: "x" }, createdAt: now(), updatedAt: now(), submittedAt: now() });

await ensureUser({ uid: "u-rn", email: "rn@utexas.edu", name: "Reneg One", role: "applicant" });
await ensureUser({ uid: "u-rn2", email: "rn2@utexas.edu", name: "Reneg Two", role: "applicant" });
await ensureUser({ uid: "u-rn3", email: "rn3@utexas.edu", name: "Reneg Three", role: "applicant" });
await ensureUser({ uid: "u-rn5", email: "rn5@utexas.edu", name: "Reneg Five", role: "applicant" });
const adminC = await session("admin@utexas.edu");
const rnC = await session("rn@utexas.edu"), rn2C = await session("rn2@utexas.edu"), rn3C = await session("rn3@utexas.edu");
let r;

r = await setStep(adminC, "release_decisions_day1"); check("step -> release_decisions_day1", r.status === 200, err(r));

// ---- a day-1 commit leaves an unreleased day-2 acceptance standing ----
await db.doc("applications/rn-a").set(accepted("u-rn", "rn@utexas.edu", "Electric", "Powertrain", 1));
await db.doc("applications/rn-b").set(accepted("u-rn", "rn@utexas.edu", "Solar", "Dynamics", 2));
await db.doc("applications/rn-c").set(accepted("u-rn", "rn@utexas.edu", "Combustion", "Body", 1));
await db.doc("users/u-rn").set({ applications: ["rn-a", "rn-b", "rn-c"] }, { merge: true });
r = await api(rnC, "GET", "/api/applications/rn-b");
check("day 1: the day-2 acceptance is still masked from the applicant", r.status === 200 && r.json?.application?.status !== "accepted" && !("offer" in (r.json?.application || {})), `${err(r)} ${r.json?.application?.status}`);
r = await api(rnC, "POST", "/api/applications/rn-a/commit", { accepted: true, declineReasons: { "rn-c": "Chose Electric" } });
let a = await get("rn-a"), b = await get("rn-b"), c = await get("rn-c");
check("commit to the day-1 offer -> 200, committed", r.status === 200 && a.status === "committed" && a.commitment?.accepted === true, `${err(r)} ${a.status}`);
check("the RELEASED rival (day 1) is declined with the applicant's reason", c.status === "declined" && c.commitment?.reason === "Chose Electric", `${c.status} ${JSON.stringify(c.commitment)}`);
check("the UNRELEASED rival (day 2) is left standing — the fix", b.status === "accepted" && !b.commitment, `${b.status} ${JSON.stringify(b.commitment ?? null)}`);

// ---- it surfaces on its own day and can be taken as a reneg ----
r = await setStep(adminC, "release_decisions_day2"); check("step -> release_decisions_day2 (sweep runs)", r.status === 200 && !r.json?.sweepError, JSON.stringify(r.json));
b = await get("rn-b");
check("the day-2 advance's sweep spares it (pass 2 exemption)", b.status === "accepted" && !b.autoRejected, `${b.status} ${JSON.stringify(b.autoRejected ?? null)}`);
r = await api(rnC, "GET", "/api/applications/rn-b");
check("day 2: now visible to the applicant, offer attached", r.status === 200 && r.json?.application?.status === "accepted" && r.json?.application?.offer?.system === "Dynamics", `${err(r)} ${r.json?.application?.status}`);
r = await api(rnC, "POST", "/api/applications/rn-b/commit", { accepted: true });
a = await get("rn-a"); b = await get("rn-b");
check("accepting it is a reneg: new commit lands, prior commitment flips to rejected with renegedFrom", r.status === 200 && b.status === "committed" && b.renegedFrom === "Electric" && a.status === "rejected", `${err(r)} b=${b.status} renegedFrom=${b.renegedFrom} a=${a.status}`);

// ---- the decline button's path ----
await db.doc("applications/rn2-a").set(accepted("u-rn2", "rn2@utexas.edu", "Electric", "Electronics", 2));
await db.doc("applications/rn2-b").set(accepted("u-rn2", "rn2@utexas.edu", "Solar", "Aerodynamics", 2));
await db.doc("users/u-rn2").set({ applications: ["rn2-a", "rn2-b"] }, { merge: true });
r = await api(rn2C, "POST", "/api/applications/rn2-a/commit", { accepted: false, reason: "Schedule conflicts" });
let d = await get("rn2-a");
check("declining a released offer -> DECLINED with the reason", r.status === 200 && d.status === "declined" && d.commitment?.accepted === false && d.commitment?.reason === "Schedule conflicts", `${err(r)} ${d.status}`);
check("a decline touches nothing else — the other acceptance stands", (await get("rn2-b")).status === "accepted");

// ---- reneg switched off: the old decline-everything behaviour stands ----
await db.doc("config/recruiting").set({ renegEnabled: false }, { merge: true });
await db.doc("applications/rn3-a").set(accepted("u-rn3", "rn3@utexas.edu", "Electric", "Body", 2));
await db.doc("applications/rn3-b").set(accepted("u-rn3", "rn3@utexas.edu", "Solar", "Powertrain", 3));
await db.doc("users/u-rn3").set({ applications: ["rn3-a", "rn3-b"] }, { merge: true });
r = await api(rn3C, "POST", "/api/applications/rn3-a/commit", { accepted: true });
d = await get("rn3-b");
check("reneg off: committing declines even the unreleased day-3 rival (no offer will be shown that cannot be taken)", r.status === 200 && d.status === "declined", `${err(r)} ${d.status}`);
await db.doc("config/recruiting").set({ renegEnabled: FieldValue.delete() }, { merge: true });

// ---- ignored preserved offer expires on the next advance ----
await db.doc("applications/rn5-a").set(accepted("u-rn5", "rn5@utexas.edu", "Combustion", "Dynamics", 2));
await db.doc("users/u-rn5").set({ applications: ["rn5-a"] }, { merge: true });
r = await setStep(adminC, "release_decisions_day3"); check("step -> release_decisions_day3 (sweep runs)", r.status === 200 && !r.json?.sweepError, JSON.stringify(r.json));
d = await get("rn5-a");
check("an unanswered day-2 acceptance expires on the day-3 advance (pass 1)", d.status === "rejected" && d.autoRejected?.reason === "offer_expired", `${d.status} ${JSON.stringify(d.autoRejected ?? null)}`);
check("the taken reneg commitment survives the day-3 sweep", (await get("rn-b")).status === "committed");

await setStep(adminC, "open");
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
