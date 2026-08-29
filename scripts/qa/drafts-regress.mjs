// No staff action may touch an unsubmitted (in_progress) application:
// single-application status route, reject route, and bulk route all refuse,
// nothing is written, and the applicant's own form keeps working. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/drafts-regress.mjs
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
const untouched = (a) => a.status === "in_progress" && !(a.interviewOffers || []).length && !(a.trialOffers || []).length && !a.reviewDecision && !(a.rejectedBySystems || []).length;
const S = (a) => `${a.status}/offers=${(a.interviewOffers || []).length}/rd=${a.reviewDecision ?? "-"}/rb=${(a.rejectedBySystems || []).join("+") || "-"}`;
const isDraftErr = (r) => r.status === 400 && /hasn't submitted/i.test(r.json?.error || "");

await ensureUser({ uid: "u-cap", email: "cap.e@utexas.edu", name: "Electric Captain", role: "team_captain_ob", memberProfile: { team: "Electric", system: "Electronics" } });
await ensureUser({ uid: "u-body", email: "lead.body@utexas.edu", name: "Body Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-draft", email: "draft@utexas.edu", name: "Drafter", role: "applicant" });
const adminC = await session("admin@utexas.edu"), capC = await session("cap.e@utexas.edu"), bodyC = await session("lead.body@utexas.edu"), appC = await session("draft@utexas.edu");
const base = (status, extra = {}) => ({ userId: "u-draft", userEmail: "draft@utexas.edu", team: "Electric", preferredSystems: ["Body", "Dynamics"], status, formData: { whyJoin: "hi" }, createdAt: now(), updatedAt: now(), ...(status !== "in_progress" ? { submittedAt: now() } : {}), ...extra });
await db.doc("applications/dr-1").set(base("in_progress"));
await db.doc("applications/dr-2").set(base("in_progress"));
await db.doc("applications/dr-sub").set(base("submitted"));
await db.doc("applications/dr-sub2").set(base("submitted"));
await db.doc("users/u-draft").set({ applications: ["dr-1", "dr-2", "dr-sub", "dr-sub2"] }, { merge: true });
let r = await api(adminC, "POST", "/api/admin/config/recruiting", { step: "reviewing", confirm: "reviewing" }); check("step -> reviewing", r.status === 200);

// ---- single-application status route ----
for (const [who, c, body] of [["admin", adminC, { status: "interview" }], ["lead", bodyC, { status: "interview", systems: ["Body"] }], ["captain", capC, { status: "interview", systems: ["Body", "Dynamics"] }]]) {
  r = await api(c, "POST", "/api/admin/applications/dr-1/status", body);
  check(`${who} advancing a draft to interview -> 400 draft error`, isDraftErr(r), `${r.status} ${r.json?.error}`);
}
for (const status of ["trial", "rejected", "waitlisted", "accepted"]) {
  r = await api(adminC, "POST", "/api/admin/applications/dr-1/status", { status, ...(status === "accepted" ? { offer: { system: "Body", role: "Member" } } : {}) });
  check(`admin setting draft -> ${status} -> 400 draft error`, isDraftErr(r), `${r.status} ${r.json?.error}`);
}
check("draft untouched after all status attempts", untouched(await get("dr-1")), S(await get("dr-1")));

// ---- reject route ----
r = await api(bodyC, "POST", "/api/admin/applications/dr-1/reject", { systems: ["Body"] });
check("lead rejecting a draft -> 400 draft error", isDraftErr(r), `${r.status} ${r.json?.error}`);
r = await api(capC, "POST", "/api/admin/applications/dr-1/reject", { systems: ["Body", "Dynamics"] });
check("captain rejecting a draft -> 400 draft error", isDraftErr(r), `${r.status} ${r.json?.error}`);
check("draft untouched after reject attempts", untouched(await get("dr-1")), S(await get("dr-1")));

// ---- bulk route: draft refused per item, submitted sibling still processed ----
r = await api(adminC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["dr-1", "dr-sub"], action: "interview" });
const item = (id) => (r.json?.results || []).find((x) => x.id === id);
check("bulk interview: draft item refused with draft error", r.status === 200 && item("dr-1")?.success === false && /hasn't submitted/i.test(item("dr-1")?.error || ""), JSON.stringify(item("dr-1")));
check("bulk interview: submitted item still advanced", item("dr-sub")?.success === true && (await get("dr-sub")).status === "interview", JSON.stringify(item("dr-sub")));
r = await api(bodyC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["dr-2"], action: "reject", systems: ["Body"] });
check("bulk reject by lead: draft refused", item("dr-2")?.success === false && /hasn't submitted/i.test(item("dr-2")?.error || ""), JSON.stringify(item("dr-2")));
await api(adminC, "POST", "/api/admin/config/recruiting", { step: "interviewing", confirm: "interviewing" });
r = await api(adminC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["dr-2"], action: "trial" });
check("bulk trial: draft refused", item("dr-2")?.success === false && /hasn't submitted/i.test(item("dr-2")?.error || ""), `${r.status} ${JSON.stringify(item("dr-2") ?? r.json)}`);
check("drafts untouched after bulk attempts", untouched(await get("dr-1")) && untouched(await get("dr-2")), `${S(await get("dr-1"))} | ${S(await get("dr-2"))}`);

// ---- submitted applications are unaffected ----
r = await api(bodyC, "POST", "/api/admin/applications/dr-sub2/status", { status: "interview", systems: ["Body"] });
check("lead advancing a SUBMITTED app still works", r.status === 200 && (await get("dr-sub2")).status === "interview", `${r.status} ${r.json?.error || ""}`);
r = await api(bodyC, "POST", "/api/admin/applications/dr-sub2/reject", { systems: ["Body"] });
check("lead rejecting a SUBMITTED app still works", r.status === 200, `${r.status} ${r.json?.error || ""}`);

// ---- the applicant can still edit and submit their draft (applications open) ----
await api(adminC, "POST", "/api/admin/config/recruiting", { step: "open", confirm: "open" });
r = await api(appC, "PATCH", "/api/applications/dr-1", { formData: { whyJoin: "still editing" } });
check("applicant can still save the draft", r.status === 200 && (await get("dr-1")).formData?.whyJoin === "still editing", `${r.status} ${r.json?.error || ""}`);

await api(adminC, "POST", "/api/admin/config/recruiting", { step: "open", confirm: "open" });
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
