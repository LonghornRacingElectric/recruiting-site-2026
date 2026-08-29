// Applicant-side gates (#111 #112 #114 #115): the applicant API tells the
// form when an application is no longer editable, trial responses need a live
// released offer, interview selection closes with the window, and the admin
// PATCH validates the ranking. (#113, locking the ranking once a system has
// acted, was deliberately NOT done: it would reveal a masked rejection.)
// Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/applicant-gates-regress.mjs
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
async function ensureUser({ uid, email, name, role, memberProfile }) {
  try { await auth.importUsers([{ uid, email, emailVerified: true, displayName: name, providerData: [{ uid: email, email, displayName: name, providerId: "google.com" }] }]); } catch {}
  await db.doc(`users/${uid}`).set({ uid, email, name, role, blacklisted: false, applications: [], phoneNumber: null, isMember: !!memberProfile, ...(memberProfile ? { memberProfile } : {}) }, { merge: true });
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

await ensureUser({ uid: "u-ag", email: "ag@utexas.edu", name: "Gated Applicant", role: "applicant" });
const adminC = await session("admin@utexas.edu"), appC = await session("ag@utexas.edu");
const mk = async (id, st, extra = {}) => { await db.doc(`applications/${id}`).set({ userId: "u-ag", userEmail: "ag@utexas.edu", team: "Electric", preferredSystems: ["Body", "Dynamics"], status: st, formData: { whyJoin: "x" }, createdAt: now(), updatedAt: now(), ...(st !== "in_progress" ? { submittedAt: now() } : {}), ...extra }); };
const off = (system, st = "pending") => ({ system, status: st, createdAt: now() });
let r = await setStep(adminC, "open"); check("step -> open", r.status === 200);

// ---- #111: editable flag on the applicant payload ----
await mk("ag-draft", "in_progress"); await mk("ag-sub", "submitted"); await mk("ag-int", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body")] });
await db.doc("users/u-ag").set({ applications: ["ag-draft", "ag-sub", "ag-int"] }, { merge: true });
r = await api(appC, "GET", "/api/applications");
const mine = Object.fromEntries((r.json?.applications || []).map((a) => [a.id, a]));
check("#111 draft is editable", mine["ag-draft"]?.editable === true, JSON.stringify(mine["ag-draft"]?.editable));
check("#111 submitted (untouched) is editable while open", mine["ag-sub"]?.editable === true, JSON.stringify(mine["ag-sub"]?.editable));
check("#111 advanced app: status still masked as submitted BUT editable=false", mine["ag-int"]?.status === "submitted" && mine["ag-int"]?.editable === false, `${mine["ag-int"]?.status} editable=${mine["ag-int"]?.editable}`);
check("#111 no internal fields leak alongside the flag", mine["ag-int"] && !("reviewDecision" in mine["ag-int"]) && !("rejectedBySystems" in mine["ag-int"]));
r = await api(appC, "GET", "/api/applications/ag-int");
check("#111 single-application GET carries editable=false too", r.status === 200 && r.json?.application?.editable === false, `${r.status} ${JSON.stringify(r.json?.application?.editable)}`);

// ---- ranking stays the applicant's to change while open, even after a (masked) rejection ----
await mk("ag-lock", "submitted", { rejectedBySystems: ["Body"] });
await db.doc("users/u-ag").set({ applications: ["ag-draft", "ag-sub", "ag-int", "ag-lock"] }, { merge: true });
r = await api(appC, "PATCH", "/api/applications/ag-lock", { preferredSystems: ["Dynamics"] });
check("ranking change after a masked rejection is allowed (no #113 lock, no signal)", r.status === 200 && (await get("ag-lock")).preferredSystems.join("+") === "Dynamics", err(r));
r = await api(appC, "GET", "/api/applications/ag-lock");
check("payload carries no systemsLocked / rejectedBySystems", r.json?.application && !("systemsLocked" in r.json.application) && !("rejectedBySystems" in r.json.application));
r = await api(appC, "PATCH", "/api/applications/ag-sub", { preferredSystems: ["Dynamics", "Body"] });
check("reordering allowed", r.status === 200 && (await get("ag-sub")).preferredSystems.join("+") === "Dynamics+Body", err(r));

// ---- #115: admin PATCH validates preferredSystems ----
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: "Body" });
check("#115 admin PATCH with a string -> 400", r.status === 400, err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: ["Body", "TrackSim"] });
check("#115 admin PATCH with an off-team system -> 400", r.status === 400, err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: ["Body", "Body"] });
check("#115 admin PATCH with a duplicate -> 400", r.status === 400, err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: ["Body", "Electronics"] });
check("#115 admin PATCH with a valid ranking -> 200", r.status === 200 && (await get("ag-sub")).preferredSystems.join("+") === "Body+Electronics", err(r));
await mk("ag-legacy", "submitted", { preferredSystems: ["Body", "Old System Name"] });
r = await api(adminC, "PATCH", "/api/admin/applications/ag-legacy", { team: "Electric", preferredSystems: ["Body", "Old System Name"], formData: { graduationYear: "2029" } });
check("#115 admin edit that resends a legacy ranking unchanged still saves (M3)", r.status === 200 && (await get("ag-legacy")).formData.graduationYear === "2029", err(r));
await mk("ag-draft-rb", "in_progress", { rejectedBySystems: ["Body"] });
await db.doc("users/u-ag").set({ applications: ["ag-draft-rb"] }, { merge: true });
r = await api(appC, "GET", "/api/applications/ag-draft-rb");
check("a draft with a stale rejectedBySystems is still editable", r.json?.application?.editable === true, JSON.stringify(r.json?.application?.editable));

// ---- #112: trial response gate ----
await mk("ag-trial", "trial", { reviewDecision: "advanced", interviewDecision: "advanced", interviewOffers: [off("Body", "completed")], trialOffers: [off("Body")] });
await mk("ag-trial-rej", "rejected", { reviewDecision: "advanced", interviewDecision: "advanced", trialDecision: "rejected", trialDecisionDay: 1, interviewOffers: [off("Body", "completed")], trialOffers: [off("Body")] });
await db.doc("users/u-ag").set({ applications: ["ag-trial", "ag-trial-rej", "ag-int"] }, { merge: true });
r = await api(appC, "POST", "/api/applications/ag-trial/trial/respond", { accepted: true });
check("#112 responding before trial offers are released -> 400", r.status === 400 && (await get("ag-trial")).trialOffers[0].accepted === undefined, err(r));
for (const s of ["reviewing", "release_interviews", "interviewing", "close_interviews", "release_trial"]) { r = await setStep(adminC, s); if (r.status !== 200) console.log("step", s, err(r)); }
r = await api(appC, "POST", "/api/applications/ag-trial-rej/trial/respond", { accepted: true });
check("#112 a rejected applicant cannot accept the (masked) trial offer", r.status === 400 && (await get("ag-trial-rej")).trialOffers[0].accepted === undefined, err(r));
r = await api(appC, "POST", "/api/applications/ag-trial/trial/respond", { accepted: true });
check("#112 a live released trial offer can be accepted", r.status === 200 && (await get("ag-trial")).trialOffers[0].accepted === true, err(r));

// ---- #114: interview selection closes with the window ----
await setStep(adminC, "interviewing");
await mk("ag-pick", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body"), off("Dynamics")] });
await mk("ag-pick-rej", "interview", { reviewDecision: "advanced", interviewDecision: "rejected", interviewOffers: [off("Body"), off("Dynamics")] });
await db.doc("users/u-ag").set({ applications: ["ag-pick", "ag-pick-rej"] }, { merge: true });
r = await api(appC, "POST", "/api/applications/ag-pick-rej/interview", { system: "Body" });
check("#114 a masked interview rejection does NOT change the response (no per-applicant signal)", r.status === 200, err(r));
r = await api(appC, "POST", "/api/applications/ag-pick/interview", { system: "Body" });
check("#114 selecting during interviewing works", r.status === 200 && (await get("ag-pick")).selectedInterviewSystem === "Body", err(r));
await mk("ag-pick2", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body"), off("Dynamics")] });
await db.doc("users/u-ag").set({ applications: ["ag-pick2"] }, { merge: true });
await setStep(adminC, "close_interviews");
r = await api(appC, "POST", "/api/applications/ag-pick2/interview", { system: "Body" });
check("#114 selecting after close_interviews -> 400, ranking untouched", r.status === 400 && (await get("ag-pick2")).preferredSystems.join("+") === "Body+Dynamics" && !(await get("ag-pick2")).selectedInterviewSystem, err(r));

await setStep(adminC, "open");
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
