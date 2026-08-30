// Regression for #57 (close_interviews predicate + signup link), #56 (promotion
// sweep) and #127 (drafts untouched by the cross-team sweep). Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/sweeps-regress.mjs
// Refuses to run without both emulator vars, so it can never touch production.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
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
const getApp = async (id) => (await db.doc(`applications/${id}`).get()).data();
const setStep = (c, step) => api(c, "POST", "/api/admin/config/recruiting", { step, confirm: step });
const offer = (system, status) => ({ system, status, createdAt: now() });

await ensureUser({ uid: "u-ci", email: "ci@utexas.edu", name: "Close Interviews", role: "applicant" });
await ensureUser({ uid: "u-pr", email: "pr@utexas.edu", name: "Promoted", role: "applicant" });
const adminC = await session("admin@utexas.edu"), ciC = await session("ci@utexas.edu");
const base = (team, systems, extra) => ({ userId: "u-ci", userEmail: "ci@utexas.edu", team, preferredSystems: systems, status: "interview", reviewDecision: "advanced", formData: {}, createdAt: now(), updatedAt: now(), submittedAt: now(), ...extra });

// ---- #57 close_interviews predicate ----
await db.doc("interviewConfigs/electric-electronics").set({ team: "Electric", system: "Electronics", signupLink: "https://example.com/book" });
await db.doc("applications/ci-completed-2offers").set(base("Electric", ["Electronics", "Body"], { interviewOffers: [offer("Electronics", "completed"), offer("Body", "pending")] }));
await db.doc("applications/ci-multi-nopick").set(base("Electric", ["Electronics", "Body"], { interviewOffers: [offer("Electronics", "pending"), offer("Body", "pending")] }));
await db.doc("applications/ci-single-pending").set(base("Electric", ["Electronics"], { interviewOffers: [offer("Electronics", "pending")] }));
await db.doc("applications/ci-noshow").set(base("Electric", ["Electronics"], { interviewOffers: [offer("Electronics", "no_show")] }));
await db.doc("applications/ci-solar-noshow").set(base("Solar", ["Powertrain"], { interviewOffers: [offer("Powertrain", "no_show")] }));
await db.doc("applications/ci-solar-pending-multi").set(base("Solar", ["Powertrain", "Aerodynamics"], { interviewOffers: [offer("Powertrain", "pending"), offer("Aerodynamics", "pending")] }));
await db.doc("applications/ci-cancelled-all").set(base("Electric", ["Electronics", "Body"], { interviewOffers: [offer("Electronics", "cancelled"), offer("Body", "cancelled")] }));

let r = await setStep(adminC, "interviewing"); check("step -> interviewing", r.status === 200);
r = await api(ciC, "GET", "/api/applications/ci-single-pending/interview");
const linkBefore = (r.json?.offers || r.json?.interviewOffers || []).find?.((o) => o.system === "Electronics")?.signupLink;
check("#57 signup link served while interviewing", r.status === 200 && !!linkBefore, `${r.status} keys=${Object.keys(r.json || {}).join(",")}`);

r = await setStep(adminC, "close_interviews"); check("step -> close_interviews (sweep)", r.status === 200 && !r.json?.sweepError, JSON.stringify(r.json));
const status = async (id) => (await getApp(id)).status;
check("#57 completed interview + later 2nd offer is SPARED", (await status("ci-completed-2offers")) === "interview", await status("ci-completed-2offers"));
check("#57 multi-offer never picked is rejected", (await status("ci-multi-nopick")) === "rejected", await status("ci-multi-nopick"));
check("#57 single pending (ambiguous) is spared", (await status("ci-single-pending")) === "interview", await status("ci-single-pending"));
check("#57 explicit no-show is rejected", (await status("ci-noshow")) === "rejected", await status("ci-noshow"));
check("#57 Solar no-show is rejected too", (await status("ci-solar-noshow")) === "rejected", await status("ci-solar-noshow"));
check("#57 Solar multi pending spared (no selection required)", (await status("ci-solar-pending-multi")) === "interview", await status("ci-solar-pending-multi"));
check("#57 all offers cancelled is rejected", (await status("ci-cancelled-all")) === "rejected", await status("ci-cancelled-all"));
const rej = await getApp("ci-noshow"); check("#57 rejection is the interview-stage decision (masked until release_trial)", rej.interviewDecision === "rejected", `${rej.interviewDecision}`);
r = await api(ciC, "GET", "/api/applications/ci-single-pending/interview");
const linkAfter = (r.json?.offers || r.json?.interviewOffers || []).find?.((o) => o.system === "Electronics")?.signupLink;
check("#57 signup link withheld after close_interviews", r.status === 200 && !linkAfter, `${r.status} link=${linkAfter}`);
r = await setStep(adminC, "close_interviews"); check("#57 re-run is idempotent", r.status === 200 && (await status("ci-completed-2offers")) === "interview");

// ---- #56 promotion survives the day-2 sweep ----
const pb = { userId: "u-pr", userEmail: "pr@utexas.edu", formData: {}, createdAt: now(), updatedAt: now(), submittedAt: now() };
await db.doc("applications/pr-a").set({ ...pb, team: "Electric", preferredSystems: ["Body"], status: "committed", trialDecision: "advanced", trialDecisionDay: 1, commitment: { accepted: true, committedAt: now() } });
await db.doc("applications/pr-b").set({ ...pb, team: "Solar", preferredSystems: ["Powertrain"], status: "accepted", trialDecision: "advanced", trialDecisionDay: 2, offer: { system: "Powertrain", role: "Member", issuedAt: now() } });
await db.doc("applications/pr-c").set({ ...pb, team: "Combustion", preferredSystems: ["Body"], status: "trial" });
// #127: an unfinished draft on another team is not an application to reject
const { submittedAt: _drafted, ...pbDraft } = pb;
await db.doc("applications/pr-d").set({ ...pbDraft, team: "Combustion", preferredSystems: [], status: "in_progress" });
r = await setStep(adminC, "release_decisions_day1"); check("step -> day1", r.status === 200);
r = await setStep(adminC, "release_decisions_day2"); check("step -> day2 (sweep)", r.status === 200 && !r.json?.sweepError, JSON.stringify(r.json));
check("#56 day-2 promotion survives pass 2", (await status("pr-b")) === "accepted", await status("pr-b"));
check("#56 other live application still cross-team rejected", (await status("pr-c")) === "rejected" && (await getApp("pr-c")).autoRejected?.reason === "committed_elsewhere", await status("pr-c"));
check("#56 committed application untouched", (await status("pr-a")) === "committed");
check("#127 the cross-team sweep leaves a draft alone", (await status("pr-d")) === "in_progress" && !(await getApp("pr-d")).autoRejected, `${await status("pr-d")} ${JSON.stringify((await getApp("pr-d")).autoRejected)}`);
r = await setStep(adminC, "release_decisions_day3"); check("step -> day3 (sweep)", r.status === 200);
check("#56 unanswered day-2 promotion expires on day 3 as before", (await status("pr-b")) === "rejected" && (await getApp("pr-b")).autoRejected?.reason === "offer_expired", `${await status("pr-b")} ${(await getApp("pr-b")).autoRejected?.reason}`);

await setStep(adminC, "open");
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
