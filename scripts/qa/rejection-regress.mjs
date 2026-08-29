// Per-system rejection regression. Walks every rejection path (per-app route,
// bulk route, lead vs captain) through review / interview / trial stages and
// asserts an application is only globally rejected once every ranked system
// has passed. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/rejection-regress.mjs
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
const reject = (c, id, systems) => api(c, "POST", `/api/admin/applications/${id}/reject`, { systems });
const setStep = (c, step) => api(c, "POST", "/api/admin/config/recruiting", { step, confirm: step });
const S = (a) => `${a.status}/rd=${a.reviewDecision ?? "-"}/id=${a.interviewDecision ?? "-"}/td=${a.trialDecision ?? "-"}/rb=${(a.rejectedBySystems || []).join("+") || "-"}`;
const isPartial = (a) => a.status === "submitted" && a.reviewDecision !== "rejected";
const isFull = (a) => a.status === "rejected" && a.reviewDecision === "rejected";

await ensureUser({ uid: "u-cap", email: "cap.e@utexas.edu", name: "Electric Captain", role: "team_captain_ob", memberProfile: { team: "Electric", system: "Electronics" } });
await ensureUser({ uid: "u-body", email: "lead.body@utexas.edu", name: "Body Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-dyn", email: "lead.dyn@utexas.edu", name: "Dynamics Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Dynamics" } });
await ensureUser({ uid: "u-pt", email: "lead.pt@utexas.edu", name: "Powertrain Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Powertrain" } });
await ensureUser({ uid: "u-rej", email: "rej@utexas.edu", name: "Rejectee", role: "applicant" });
const adminC = await session("admin@utexas.edu"), capC = await session("cap.e@utexas.edu");
const bodyC = await session("lead.body@utexas.edu"), dynC = await session("lead.dyn@utexas.edu"), ptC = await session("lead.pt@utexas.edu");
const appC = await session("rej@utexas.edu");
const base = (ranked, extra = {}) => ({ userId: "u-rej", userEmail: "rej@utexas.edu", team: "Electric", preferredSystems: ranked, status: "submitted", formData: {}, createdAt: now(), updatedAt: now(), submittedAt: now(), ...extra });

// ================= REVIEW STAGE =================
let r = await setStep(adminC, "reviewing"); check("step -> reviewing", r.status === 200);

// A. Will's case: Powertrain (ranked 2nd) rejects; Dynamics (ranked 1st) still gets a look
await db.doc("applications/rj-will").set(base(["Dynamics", "Powertrain", "Vehicle Modeling & Software"]));
r = await reject(ptC, "rj-will", ["Powertrain"]);
let a = await get("rj-will");
check("A. Powertrain lead rejects 3-system app -> 200, fullyRejected=false", r.status === 200 && r.json?.fullyRejected === false, `${r.status} ${JSON.stringify(r.json?.fullyRejected)}`);
check("A. status stays submitted, no reviewDecision, Powertrain recorded", isPartial(a) && JSON.stringify(a.rejectedBySystems) === '["Powertrain"]', S(a));
r = await api(dynC, "POST", "/api/admin/applications/rj-will/status", { status: "interview", systems: ["Dynamics"] });
a = await get("rj-will");
check("A. Dynamics lead can still extend interview -> interview/advanced, Powertrain rejection kept as history", r.status === 200 && a.status === "interview" && a.reviewDecision === "advanced" && JSON.stringify(a.rejectedBySystems) === '["Powertrain"]', `${r.status} ${S(a)}`);

// B. Sequential: every ranked system has to pass before it's final
await db.doc("applications/rj-seq").set(base(["Body", "Dynamics", "Powertrain"]));
await reject(bodyC, "rj-seq", ["Body"]); a = await get("rj-seq");
check("B. 1/3 rejected -> partial", isPartial(a) && a.rejectedBySystems.length === 1, S(a));
await reject(dynC, "rj-seq", ["Dynamics"]); a = await get("rj-seq");
check("B. 2/3 rejected -> still partial", isPartial(a) && a.rejectedBySystems.length === 2, S(a));
r = await reject(ptC, "rj-seq", ["Powertrain"]); a = await get("rj-seq");
check("B. 3/3 rejected -> fully rejected, fullyRejected=true", isFull(a) && r.json?.fullyRejected === true && a.rejectedBySystems.length === 3, S(a));

// C. Single ranked system: first rejection is final (unchanged)
await db.doc("applications/rj-single").set(base(["Body"]));
r = await reject(bodyC, "rj-single", ["Body"]); a = await get("rj-single");
check("C. only ranked system rejects -> fully rejected", isFull(a) && r.json?.fullyRejected === true, S(a));

// D. Captain bulk reject without systems = whole application (every ranked system)
await db.doc("applications/rj-bulk-cap").set(base(["Body", "Dynamics"]));
r = await api(capC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["rj-bulk-cap"], action: "reject" });
a = await get("rj-bulk-cap");
check("D. captain bulk reject (no systems) -> fully rejected via all ranked", r.status === 200 && isFull(a) && a.rejectedBySystems.length === 2, `${r.status} ${S(a)}`);

// E. Captain per-app reject with a subset stays partial; with all ranked is final
await db.doc("applications/rj-cap-sub").set(base(["Body", "Dynamics"]));
await reject(capC, "rj-cap-sub", ["Body"]); a = await get("rj-cap-sub");
check("E. captain rejects subset [Body] of [Body,Dynamics] -> partial", isPartial(a), S(a));
await reject(capC, "rj-cap-sub", ["Dynamics"]); a = await get("rj-cap-sub");
check("E. captain then rejects Dynamics -> fully rejected", isFull(a), S(a));
await db.doc("applications/rj-cap-all").set(base(["Body", "Dynamics"]));
await reject(capC, "rj-cap-all", ["Body", "Dynamics"]); a = await get("rj-cap-all");
check("E. captain rejects all ranked in one call -> fully rejected", isFull(a), S(a));

// F. Lead bulk reject (own system) on multi-ranked apps -> partial, none globally rejected
await db.doc("applications/rj-bulk-l1").set(base(["Body", "Powertrain"]));
await db.doc("applications/rj-bulk-l2").set(base(["Dynamics", "Body", "Powertrain"]));
r = await api(bodyC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["rj-bulk-l1", "rj-bulk-l2"], action: "reject", systems: ["Body"] });
const l1 = await get("rj-bulk-l1"), l2 = await get("rj-bulk-l2");
check("F. lead bulk reject -> both partial, Body recorded on each", r.status === 200 && isPartial(l1) && isPartial(l2) && l1.rejectedBySystems.includes("Body") && l2.rejectedBySystems.includes("Body"), `${S(l1)} | ${S(l2)}`);

// G. Repeat rejection is idempotent
await reject(bodyC, "rj-bulk-l1", ["Body"]); a = await get("rj-bulk-l1");
check("G. rejecting the same system twice -> no duplicate, still partial", isPartial(a) && a.rejectedBySystems.length === 1, S(a));

// H. No ranked systems at all (shouldn't exist, but no one is left to wait for)
await db.doc("applications/rj-none").set(base([]));
await reject(capC, "rj-none", ["Body"]); a = await get("rj-none");
check("H. app with no ranked systems -> rejection is final", isFull(a), S(a));

// I. Applicant never sees a partial rejection, even after review decisions release
r = await setStep(adminC, "release_interviews"); check("step -> release_interviews", r.status === 200);
r = await api(appC, "GET", "/api/applications");
const mine = (r.json?.applications || []);
const vis = (id) => mine.find((x) => x.id === id);
check("I. partial (rj-bulk-l1) NOT shown as rejected to applicant", vis("rj-bulk-l1") && vis("rj-bulk-l1").status !== "rejected", `${vis("rj-bulk-l1")?.status}`);
check("I. full (rj-seq) IS shown as rejected to applicant", vis("rj-seq")?.status === "rejected", `${vis("rj-seq")?.status}`);
check("I. Will's case shown as interview to applicant", vis("rj-will")?.status === "interview", `${vis("rj-will")?.status}`);
check("I. no internal fields leaked to applicant", mine.length > 0 && mine.every((x) => x.reviewDecision === undefined && x.rejectedBySystems === undefined), `${mine.length} apps`);

// ================= INTERVIEW STAGE (existing behaviour preserved) =================
r = await setStep(adminC, "interviewing"); check("step -> interviewing", r.status === 200);
const off = (system, status = "pending") => ({ system, status, createdAt: now() });
await db.doc("applications/rj-int").set(base(["Body", "Dynamics", "Powertrain"], { status: "interview", reviewDecision: "advanced", interviewOffers: [off("Body"), off("Dynamics")] }));
await reject(bodyC, "rj-int", ["Body"]); a = await get("rj-int");
check("J. interview stage: Body rejects, Dynamics offer alive -> still interview", a.status === "interview" && a.interviewDecision !== "rejected" && a.interviewOffers.length === 2, S(a));
r = await reject(dynC, "rj-int", ["Dynamics"]); a = await get("rj-int");
check("J. all interview offers rejected -> interviewDecision rejected, status rejected, offers kept for history", a.status === "rejected" && a.interviewDecision === "rejected" && a.reviewDecision === "advanced" && a.interviewOffers.length === 2 && r.json?.fullyRejected === true, S(a));

// K. Interview stage, never advanced (no offers), multi-ranked -> same all-ranked rule
await db.doc("applications/rj-int-none").set(base(["Body", "Dynamics"]));
await reject(bodyC, "rj-int-none", ["Body"]); a = await get("rj-int-none");
check("K. post-review step, no offers, 1/2 rejected -> partial", isPartial(a), S(a));
await reject(dynC, "rj-int-none", ["Dynamics"]); a = await get("rj-int-none");
check("K. 2/2 rejected -> fully rejected", isFull(a), S(a));

// ================= TRIAL STAGE (existing behaviour preserved) =================
r = await setStep(adminC, "trial_workday"); check("step -> trial_workday", r.status === 200);
await db.doc("applications/rj-trial").set(base(["Body", "Dynamics"], { status: "trial", reviewDecision: "advanced", interviewDecision: "advanced", interviewOffers: [off("Body", "completed")], trialOffers: [{ system: "Body", status: "pending", createdAt: now() }] }));
r = await reject(bodyC, "rj-trial", ["Body"]); a = await get("rj-trial");
check("L. trial stage: only trial system rejects -> trialDecision rejected, day 1, status rejected", a.status === "rejected" && a.trialDecision === "rejected" && a.trialDecisionDay === 1 && a.interviewDecision === "advanced" && a.trialOffers.length === 1, S(a) + ` day=${a.trialDecisionDay}`);

await setStep(adminC, "open");
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
