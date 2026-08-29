// Staff audit log (#119): every mutating route writes an entry with the actor,
// refusals are recorded, reads are scoped (staff see an application's history
// they can access; admins see everything; captains see their team; leads and
// applicants are refused), and no applicant PII ever appears. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/audit-regress.mjs
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
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie, "user-agent": "audit-harness/1.0" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; let t = ""; try { t = await r.text(); j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
const now = () => new Date();
const APPLICANT_NAME = "Secretname Applicantperson", APPLICANT_EMAIL = "secret.applicant@utexas.edu";
const entriesFor = async (id) => (await db.collection("audit_log").where("applicationId", "==", id).get()).docs.map((d) => d.data());
const allEntries = async () => (await db.collection("audit_log").get()).docs.map((d) => d.data());

await db.collection("audit_log").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
await ensureUser({ uid: "u-cap", email: "cap.e@utexas.edu", name: "Electric Captain", role: "team_captain_ob", memberProfile: { team: "Electric", system: "Electronics" } });
await ensureUser({ uid: "u-caps", email: "cap.s@utexas.edu", name: "Solar Captain", role: "team_captain_ob", memberProfile: { team: "Solar", system: "Powertrain" } });
await ensureUser({ uid: "u-body", email: "lead.body@utexas.edu", name: "Body Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-au", email: APPLICANT_EMAIL, name: APPLICANT_NAME, role: "applicant" });
await ensureUser({ uid: "u-target", email: "target@utexas.edu", name: "Target Person", role: "applicant" });
const adminC = await session("admin@utexas.edu"), capC = await session("cap.e@utexas.edu"), capSC = await session("cap.s@utexas.edu"), bodyC = await session("lead.body@utexas.edu"), appC = await session(APPLICANT_EMAIL);
const mk = async (id, team = "Electric", extra = {}) => db.doc(`applications/${id}`).set({ userId: "u-au", userEmail: APPLICANT_EMAIL, userName: APPLICANT_NAME, team, preferredSystems: team === "Electric" ? ["Body", "Dynamics"] : ["Powertrain", "Dynamics"], status: "submitted", formData: { whyJoin: "x" }, createdAt: now(), updatedAt: now(), submittedAt: now(), ...extra });
await mk("au-1"); await mk("au-2"); await mk("au-3"); await mk("au-solar", "Solar");
let r = await api(adminC, "POST", "/api/admin/config/recruiting", { step: "open", confirm: "open" });

// ---- writes ----
r = await api(bodyC, "POST", "/api/admin/applications/au-1/reject", { systems: ["Body"] });
let e = await entriesFor("au-1");
check("per-system reject writes an entry with the lead as actor", r.status === 200 && e.some((x) => x.action === "application.reject" && x.outcome === "ok" && x.actor.uid === "u-body" && x.actor.email === "lead.body@utexas.edu" && x.actor.system === "Body" && x.systems?.join() === "Body"), JSON.stringify(e.map((x) => [x.action, x.outcome, x.actor?.uid])));
check("reject entry has before/after snapshots and team, no applicant PII", e.some((x) => x.action === "application.reject" && x.applicantTeam === "Electric" && x.before?.status === "submitted" && Array.isArray(x.after?.rejectedBySystems)) && !JSON.stringify(e).includes(APPLICANT_EMAIL) && !JSON.stringify(e).includes("Secretname"));
check("entry carries the request user agent", e.some((x) => x.userAgent === "audit-harness/1.0"));

r = await api(bodyC, "POST", "/api/admin/applications/au-1/status", { status: "rejected" });
e = await entriesFor("au-1");
check("a refused action is recorded as refused, with the reason", r.status === 403 && e.some((x) => x.action === "application.status" && x.outcome === "refused" && /per system/i.test(x.detail || "")), JSON.stringify(e.filter((x) => x.outcome === "refused").map((x) => x.detail)));

r = await api(adminC, "POST", "/api/admin/applications/au-2/status", { status: "interview", systems: ["Body"] });
e = await entriesFor("au-2");
check("status change by admin: before submitted → after interview", r.status === 200 && e.some((x) => x.action === "application.status" && x.before?.status === "submitted" && x.after?.status === "interview" && x.detail === "submitted → interview" && x.actor.role === "admin"), JSON.stringify(e.map((x) => [x.detail, x.before?.status, x.after?.status])));

r = await api(capC, "POST", "/api/admin/applications/bulk-status", { applicationIds: ["au-3", "au-solar"], action: "reject" });
const e3 = await entriesFor("au-3"), eS = await entriesFor("au-solar");
check("bulk writes one entry per application, ok for own team", e3.some((x) => x.action === "application.bulk" && x.outcome === "ok" && x.actor.uid === "u-cap" && x.applicantTeam === "Electric"), JSON.stringify(e3.map((x) => [x.action, x.outcome])));
check("bulk refusal (other team) recorded as refused", eS.some((x) => x.action === "application.bulk" && x.outcome === "refused" && /access/i.test(x.detail || "")), JSON.stringify(eS.map((x) => [x.outcome, x.detail])));

r = await api(adminC, "PATCH", "/api/admin/applications/au-2", { formData: { major: "ME" } });
e = await entriesFor("au-2");
check("admin edit recorded with the fields touched", r.status === 200 && e.some((x) => x.action === "application.edit" && /formData/.test(x.detail || "") && /major/.test(x.detail || "")), JSON.stringify(e.filter((x) => x.action === "application.edit").map((x) => x.detail)));

r = await api(adminC, "PATCH", "/api/admin/applications/au-2/interview/Body", { status: "completed" });
e = await entriesFor("au-2");
check("interview offer status change recorded", r.status === 200 && e.some((x) => x.action === "application.interview_offer" && /Body interview → completed/.test(x.detail || "")), `${r.status} ${JSON.stringify(e.filter((x) => x.action === "application.interview_offer").map((x) => x.detail))}`);

r = await api(adminC, "PATCH", "/api/admin/users/u-target", { role: "system_lead", team: "Electric", system: "Dynamics", isMember: true });
let all = await allEntries();
check("user role change recorded with target, before and after", r.status === 200 && all.some((x) => x.action === "user.update" && x.targetUid === "u-target" && x.before?.role === "applicant" && x.after?.role === "system_lead" && x.after?.system === "Dynamics"), JSON.stringify(all.filter((x) => x.action === "user.update").map((x) => [x.targetUid, x.before, x.after])));

r = await api(adminC, "POST", "/api/admin/config/recruiting", { step: "reviewing" });
all = await allEntries();
check("recruiting step change recorded", r.status === 200 && all.some((x) => x.action === "config.recruiting_step" && x.before?.step === "open" && x.after?.step === "reviewing"), JSON.stringify(all.filter((x) => x.action === "config.recruiting_step").map((x) => x.detail)));

r = await api(adminC, "POST", "/api/admin/applications/export-csv", { team: "Electric" });
all = await allEntries();
check("CSV export recorded", all.some((x) => x.action === "application.export" && x.actor.uid === "seed-admin"), `${r.status} ${JSON.stringify(all.filter((x) => x.action === "application.export").map((x) => x.detail))}`);

check("no entry anywhere contains the applicant's name or email", !JSON.stringify(all).includes(APPLICANT_EMAIL) && !JSON.stringify(all).includes("Secretname"));

// ---- reads ----
r = await api(bodyC, "GET", "/api/admin/applications/au-1/audit");
check("lead can read history of an application they can access", r.status === 200 && (r.json?.entries || []).some((x) => x.action === "application.reject") && (r.json?.entries || []).some((x) => x.outcome === "refused"), `${r.status} ${(r.json?.entries || []).length}`);
r = await api(bodyC, "GET", "/api/admin/applications/au-solar/audit");
check("lead cannot read history of an application outside their scope", r.status === 403, `${r.status}`);
r = await api(appC, "GET", "/api/admin/applications/au-1/audit");
check("applicant cannot read history", r.status === 401 || r.status === 403, `${r.status}`);
r = await api(adminC, "GET", "/api/admin/audit?limit=100");
check("admin activity feed includes config and user entries", r.status === 200 && r.json.entries.some((x) => x.action === "config.recruiting_step") && r.json.entries.some((x) => x.action === "user.update") && r.json.entries.some((x) => x.action === "application.reject"), `${r.status} ${r.json?.entries?.length}`);
check("activity feed is newest first", r.json.entries.every((x, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(x.at)));
r = await api(capC, "GET", "/api/admin/audit?limit=100");
check("Electric captain sees only Electric application entries — no config/user/other-team entries", r.status === 200 && r.json.entries.length > 0 && r.json.entries.every((x) => x.applicantTeam === "Electric"), `${r.status} ${JSON.stringify([...new Set((r.json?.entries || []).map((x) => x.applicantTeam ?? x.action))])}`);
r = await api(capSC, "GET", "/api/admin/audit?limit=100");
check("Solar captain sees the refused bulk attempt on the Solar app", r.status === 200 && r.json.entries.some((x) => x.applicationId === "au-solar" && x.outcome === "refused") && r.json.entries.every((x) => x.applicantTeam === "Solar"), `${r.status} ${r.json?.entries?.length}`);
r = await api(bodyC, "GET", "/api/admin/audit");
check("lead cannot read the activity feed", r.status === 403, `${r.status}`);
r = await api(adminC, "GET", "/api/admin/audit?action=application.status");
check("action filter works", r.status === 200 && r.json.entries.length > 0 && r.json.entries.every((x) => x.action === "application.status"), `${r.json?.entries?.length}`);
r = await api(adminC, "GET", "/api/admin/audit?actor=u-body");
check("actor filter works", r.status === 200 && r.json.entries.length > 0 && r.json.entries.every((x) => x.actor.uid === "u-body"), `${r.json?.entries?.length}`);
check("feed payload has no applicant PII", !r.text.includes(APPLICANT_EMAIL) && !r.text.includes("Secretname"));

await api(adminC, "POST", "/api/admin/config/recruiting", { step: "open", confirm: "open" });
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
