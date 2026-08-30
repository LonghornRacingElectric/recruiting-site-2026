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
// Complete against the emulator's default question set (5 required common answers, electric_skills, resume).
const COMPLETE = { whyJoin: "why", relevantExperience: "exp", availability: "5551234567", graduationYear: "2029", major: "ME", resumeUrl: "https://example.test/resume.pdf", portfolioUrl: "", teamQuestions: { electric_skills: "skills" }, customAnswers: {} };
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

// ---- a rejection made while open is masked, so it must NOT freeze the form (#121 review, finding 3) ----
await mk("ag-rej-open", "rejected", { reviewDecision: "rejected", rejectedBySystems: ["Body", "Dynamics"], formData: COMPLETE });
await db.doc("users/u-ag").set({ applications: ["ag-draft", "ag-sub", "ag-int", "ag-rej-open"] }, { merge: true });
r = await api(appC, "GET", "/api/applications/ag-rej-open");
check("rejected while open: masked as submitted AND editable — indistinguishable from a peer", r.status === 200 && r.json?.application?.status === "submitted" && r.json?.application?.editable === true && !("reviewDecision" in (r.json?.application || {})) && !("rejectedBySystems" in (r.json?.application || {})), `${r.status} ${r.json?.application?.status} editable=${r.json?.application?.editable}`);
r = await api(appC, "PATCH", "/api/applications/ag-rej-open", { formData: { whyJoin: "edited after masked rejection" } });
let dr = await get("ag-rej-open");
check("rejected while open: a formData edit saves (200) — same answer as a peer", r.status === 200 && dr.formData.whyJoin === "edited after masked rejection", err(r));
check("rejected while open: the decision survives the edit", dr.status === "rejected" && dr.reviewDecision === "rejected" && dr.rejectedBySystems.join("+") === "Body+Dynamics", `${dr.status} ${dr.reviewDecision}`);
r = await api(appC, "PATCH", "/api/applications/ag-rej-open", { status: "submitted", preferredSystems: ["Dynamics", "Body"], formData: { whyJoin: "resubmit" } });
dr = await get("ag-rej-open");
check("rejected while open: Submit from the form is accepted but never rewrites status", r.status === 200 && dr.status === "rejected" && dr.reviewDecision === "rejected" && dr.formData.whyJoin === "resubmit" && dr.preferredSystems.join("+") === "Dynamics+Body", `${err(r)} status=${dr.status}`);
r = await api(appC, "PATCH", "/api/applications/ag-rej-open", { status: "interview" });
check("rejected while open: still cannot set a status it doesn't own", r.status === 400 && (await get("ag-rej-open")).status === "rejected", err(r));

// ---- #127: required answers are enforced server-side ----
await mk("ag-req", "in_progress", { formData: { ...COMPLETE, resumeUrl: "" } });
r = await api(appC, "PATCH", "/api/applications/ag-req", { status: "submitted" });
check("#127 submit without a resume -> 400 naming Resume; still a draft", r.status === 400 && /Resume/.test(r.json?.error || "") && (await get("ag-req")).status === "in_progress", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { status: "submitted", formData: { resumeUrl: "https://example.test/resume.pdf", relevantExperience: "" } });
check("#127 submit with a required answer blank -> 400 naming it", r.status === 400 && /experience/i.test(r.json?.error || "") && (await get("ag-req")).status === "in_progress", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { status: "submitted", formData: { resumeUrl: "https://example.test/resume.pdf" } });
check("#127 complete submit -> 200", r.status === 200 && (await get("ag-req")).status === "submitted", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { formData: { whyJoin: "why (edited)" } });
check("#127 a normal post-submit edit still saves", r.status === 200 && (await get("ag-req")).formData.whyJoin === "why (edited)", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { preferredSystems: ["Dynamics"] });
check("#127 narrowing the ranking is still the applicant's call", r.status === 200 && (await get("ag-req")).preferredSystems.join("+") === "Dynamics", err(r));

// ---- #127: two tabs, one application — the older copy never wins ----
const TAB_A = "tab-a-" + Date.now(), TAB_B = "tab-b-" + Date.now();
r = await api(appC, "GET", "/api/applications/ag-req");
let baseA = r.json?.application?.lastEditAt ?? null;
check("#127 lastEditSession never reaches the applicant payload", r.status === 200 && !("lastEditSession" in (r.json?.application || {})));
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_B, baseEditAt: baseA, formData: { whyJoin: "from tab B" } });
check("#127 tab B saves -> 200 and the payload carries lastEditAt", r.status === 200 && !!r.json?.application?.lastEditAt, err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: baseA, formData: { whyJoin: "stale tab A", resumeUrl: "", relevantExperience: "" } });
dr = await get("ag-req");
check("#127 stale tab A -> 409, tab B's data intact (the Aug 28 resume wipe)", r.status === 409 && dr.formData.whyJoin === "from tab B" && !!dr.formData.resumeUrl && dr.formData.relevantExperience === "exp", `${err(r)} whyJoin=${dr.formData.whyJoin} resume=${!!dr.formData.resumeUrl}`);
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: baseA, status: "submitted" });
check("#127 a stale tab cannot submit over the newer copy either -> 409", r.status === 409, err(r));
r = await api(appC, "GET", "/api/applications/ag-req"); baseA = r.json.application.lastEditAt;
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: baseA, formData: { whyJoin: "tab A after reload" } });
check("#127 tab A after reloading -> 200", r.status === 200 && (await get("ag-req")).formData.whyJoin === "tab A after reload", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: null, formData: { whyJoin: "tab A, stale base" } });
check("#127 the same tab is never refused (in-flight save racing its follow-up)", r.status === 200 && (await get("ag-req")).formData.whyJoin === "tab A, stale base", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { formData: { whyJoin: "legacy client" } });
check("#127 a client sending no session (older cached form) is accepted", r.status === 200 && (await get("ag-req")).formData.whyJoin === "legacy client", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: null, formData: { resumeUrl: "" } });
check("#127 the applicant's own Remove-resume on a submitted application saves (no wedge)", r.status === 200 && (await get("ag-req")).formData.resumeUrl === "", err(r));
r = await api(appC, "PATCH", "/api/applications/ag-req", { editSession: TAB_A, baseEditAt: null, preferredSystems: ["Dynamics", "Body"] });
check("#127 adding a system to a submitted application saves before its questions are answered", r.status === 200 && (await get("ag-req")).preferredSystems.join("+") === "Dynamics+Body", err(r));

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
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { team: "Solar" });
check("#115 team change that would leave an off-team ranking behind -> 400", r.status === 400 && (await get("ag-sub")).team === "Electric", err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { team: "Solar", preferredSystems: ["Powertrain", "TrackSim"] });
check("#115 team change with a matching new ranking -> 200", r.status === 200 && (await get("ag-sub")).team === "Solar" && (await get("ag-sub")).preferredSystems.join("+") === "Powertrain+TrackSim", err(r));
await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { team: "Electric", preferredSystems: ["Body", "Electronics"] });
await mk("ag-noranking", "submitted", { preferredSystems: [] });
r = await api(adminC, "PATCH", "/api/admin/applications/ag-noranking", { team: "Solar" });
check("#115 team change on an application with no ranking -> 400 (must set one for the new team)", r.status === 400 && (await get("ag-noranking")).team === "Electric", err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-noranking", { team: "Solar", preferredSystems: [] });
check("#115 team change with an explicitly empty ranking -> 400", r.status === 400 && (await get("ag-noranking")).team === "Electric", err(r));
r = await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: [] });
check("#115 clearing the ranking on the same team is still allowed (matches the applicant route)", r.status === 200 && (await get("ag-sub")).preferredSystems.length === 0, err(r));
await api(adminC, "PATCH", "/api/admin/applications/ag-sub", { preferredSystems: ["Body", "Electronics"] });
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
check("#112 an applicant rejected during trial (decision masked) gets the SAME answer as a peer — no oracle", r.status === 200 && (await get("ag-trial-rej")).status === "rejected" && (await get("ag-trial-rej")).trialDecision === "rejected", `${err(r)} status=${(await get("ag-trial-rej")).status}`);
r = await api(appC, "POST", "/api/applications/ag-trial/trial/respond", { accepted: true });
check("#112 a live released trial offer can be accepted", r.status === 200 && (await get("ag-trial")).trialOffers[0].accepted === true, err(r));

// ---- #114: interview selection closes with the window ----
await setStep(adminC, "interviewing");
await mk("ag-pick", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body"), off("Dynamics")] });
await mk("ag-pick-rej", "interview", { reviewDecision: "advanced", interviewDecision: "rejected", interviewOffers: [off("Body"), off("Dynamics")] });
await db.doc("users/u-ag").set({ applications: ["ag-pick", "ag-pick-rej"] }, { merge: true });
r = await api(appC, "POST", "/api/applications/ag-pick-rej/interview", { system: "Body" });
check("#114 a masked interview rejection does NOT change the response (no per-applicant signal)", r.status === 200, err(r));
r = await api(appC, "GET", "/api/applications/ag-pick/interview");
check("#114 GET offers the picker during interviewing", r.status === 200 && r.json?.needsSystemSelection === true, `${r.status} ${JSON.stringify(r.json?.needsSystemSelection)}`);
r = await api(appC, "POST", "/api/applications/ag-pick/interview", { system: "Body" });
check("#114 selecting during interviewing works", r.status === 200 && (await get("ag-pick")).selectedInterviewSystem === "Body", err(r));
r = await api(adminC, "POST", "/api/admin/applications/ag-pick/status", { status: "interview", systems: ["Dynamics"] });
check("#127 re-offering a system the applicant declined by choosing another -> 400, offer stays cancelled", r.status === 400 && (await get("ag-pick")).interviewOffers.find((o) => o.system === "Dynamics")?.status === "cancelled", err(r));
r = await api(adminC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["ag-pick"], action: "interview", systems: ["Dynamics"] });
check("#127 bulk re-offer of a declined system is refused per item", r.status === 200 && r.json?.results?.[0]?.success === false && /already chose|did not rank/i.test(r.json?.results?.[0]?.error || ""), `${r.status} ${JSON.stringify(r.json?.results)}`);
r = await api(adminC, "POST", "/api/admin/applications/ag-pick/status", { status: "interview", systems: ["Body"] });
check("#127 re-offering the chosen system is still fine", r.status === 200, err(r));
await mk("ag-pick2", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body"), off("Dynamics")] });
await db.doc("users/u-ag").set({ applications: ["ag-pick2"] }, { merge: true });
await setStep(adminC, "close_interviews");
r = await api(appC, "GET", "/api/applications/ag-pick2/interview");
check("#114 GET no longer offers the picker after close_interviews (no dead-end UI)", r.status === 200 && r.json?.needsSystemSelection === false, `${r.status} ${JSON.stringify(r.json?.needsSystemSelection)}`);
r = await api(appC, "POST", "/api/applications/ag-pick2/interview", { system: "Body" });
check("#114 selecting after close_interviews -> 400, ranking untouched", r.status === 400 && (await get("ag-pick2")).preferredSystems.join("+") === "Body+Dynamics" && !(await get("ag-pick2")).selectedInterviewSystem, err(r));

await setStep(adminC, "open");
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
