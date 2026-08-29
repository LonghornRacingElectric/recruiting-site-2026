// Users page (PATCH /api/admin/users/[uid]): captains manage their own team's
// roster; only admins change roles; an unchanged role is a no-op, not a 403.
// Regression for the "Failed to update user" every captain save used to hit —
// the edit form always sends the target's current role, and the route refused
// any non-admin request that carried one. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/users-regress.mjs
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
  await db.doc(`users/${uid}`).set({ uid, email, name, role, blacklisted: false, applications: [], phoneNumber: null, isMember: !!memberProfile, ...(memberProfile ? { memberProfile } : { memberProfile: admin.firestore.FieldValue.delete() }) }, { merge: true });
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
const user = async (uid) => (await db.doc(`users/${uid}`).get()).data();
const err = (r) => `${r.status} ${r.json?.error || ""}`;
const patch = (c, uid, body) => api(c, "PATCH", `/api/admin/users/${uid}`, body);

await ensureUser({ uid: "u-cap-c", email: "cap.c@utexas.edu", name: "Combustion Captain", role: "team_captain_ob", memberProfile: { team: "Combustion", system: "Powertrain" } });
await ensureUser({ uid: "u-cap-none", email: "cap.none@utexas.edu", name: "Teamless Captain", role: "team_captain_ob" });
await ensureUser({ uid: "u-lead-c", email: "lead.c@utexas.edu", name: "Combustion Lead", role: "system_lead", memberProfile: { team: "Combustion", system: "Body" } });
await ensureUser({ uid: "u-lead-e", email: "lead.e@utexas.edu", name: "Electric Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-new", email: "new.member@utexas.edu", name: "New Member", role: "applicant" });
await ensureUser({ uid: "u-app-x", email: "app.x@utexas.edu", name: "Plain Applicant", role: "applicant" });
const adminC = await session("admin@utexas.edu");
const capC = await session("cap.c@utexas.edu");
const capNoneC = await session("cap.none@utexas.edu");
const leadC = await session("lead.c@utexas.edu");
const appC = await session("app.x@utexas.edu");
let r, u;

// ---- the report: a captain saves a team-mate's system with the role left as-is ----
r = await patch(capC, "u-lead-c", { role: "system_lead", team: "Combustion", system: "Dynamics" });
u = await user("u-lead-c");
check("captain updates a team-mate's system, role sent unchanged -> 200 (the reported failure)", r.status === 200 && u.memberProfile.system === "Dynamics" && u.role === "system_lead", err(r));
r = await patch(capC, "u-lead-c", { team: "Combustion", system: "Body" });
u = await user("u-lead-c");
check("captain save without a role field -> 200", r.status === 200 && u.memberProfile.system === "Body", err(r));

// ---- role changes stay admin-only, and say so ----
r = await patch(capC, "u-lead-c", { role: "reviewer", team: "Combustion", system: "Dynamics" });
u = await user("u-lead-c");
check("captain changing a role -> 403 naming admins; nothing written", r.status === 403 && /admin/i.test(r.json?.error || "") && u.role === "system_lead" && u.memberProfile.system === "Body", err(r));
r = await patch(capC, "u-new", { role: "system_lead", team: "Combustion", system: "Body" });
u = await user("u-new");
check("captain cannot promote an unteamed user while adding them", r.status === 403 && u.role === "applicant" && !u.memberProfile, err(r));

// ---- roster scoping ----
r = await patch(capC, "u-new", { role: "applicant", team: "Combustion", system: "Body" });
u = await user("u-new");
check("captain adds an unteamed user to their own team -> 200, isMember true", r.status === 200 && u.memberProfile?.team === "Combustion" && u.memberProfile?.system === "Body" && u.isMember === true, err(r));
r = await patch(capC, "u-lead-e", { role: "system_lead", team: "Combustion", system: "Body" });
u = await user("u-lead-e");
check("captain touching another team's member -> 403; untouched", r.status === 403 && u.memberProfile.team === "Electric", err(r));
r = await patch(capC, "u-lead-c", { role: "system_lead", team: "Electric", system: "Body" });
u = await user("u-lead-c");
check("captain moving a team-mate to another team -> 403; untouched", r.status === 403 && u.memberProfile.team === "Combustion", err(r));
r = await patch(capC, "u-cap-c", { role: "team_captain_ob", team: "Combustion", system: "Body" });
u = await user("u-cap-c");
check("captain editing themselves -> 403; untouched", r.status === 403 && u.memberProfile.system === "Powertrain", err(r));
r = await patch(capNoneC, "u-lead-c", { role: "system_lead", team: "Combustion", system: "Dynamics" });
u = await user("u-lead-c");
check("captain with no team -> 403 that says so", r.status === 403 && /no team/i.test(r.json?.error || "") && u.memberProfile.system === "Body", err(r));
r = await patch(capC, "u-lead-c", { role: "system_lead", team: "Combustion", system: "TrackSim" });
check("captain setting a system that isn't on the team -> 400", r.status === 400 && (await user("u-lead-c")).memberProfile.system === "Body", err(r));
r = await patch(capC, "u-new", { role: "applicant", team: null, system: null });
u = await user("u-new");
check("captain removes a team-mate from the team -> 200, membership cleared", r.status === 200 && !u.memberProfile && u.isMember === false, err(r));
r = await patch(capC, "u-missing-xyz", { role: "applicant", team: "Combustion", system: "Body" });
check("captain targeting an unknown uid -> 404", r.status === 404, err(r));

// ---- admin ----
r = await patch(adminC, "u-lead-c", { role: "reviewer", team: "Combustion", system: "Body" });
u = await user("u-lead-c");
check("admin changes a role -> 200", r.status === 200 && u.role === "reviewer", err(r));
r = await patch(adminC, "u-lead-c", { role: "reviewer", team: "Combustion", system: "Powertrain" });
u = await user("u-lead-c");
check("admin save with an unchanged role -> 200", r.status === 200 && u.role === "reviewer" && u.memberProfile.system === "Powertrain", err(r));
r = await patch(adminC, "u-lead-c", { role: "system_lead", team: "Electric", system: "Body" });
u = await user("u-lead-c");
check("admin moves a user across teams -> 200", r.status === 200 && u.role === "system_lead" && u.memberProfile.team === "Electric", err(r));
r = await patch(adminC, "u-lead-c", { role: "superuser", team: "Combustion", system: "Body" });
check("admin with an invalid role -> 400", r.status === 400 && (await user("u-lead-c")).role === "system_lead", err(r));
r = await patch(adminC, "u-missing-xyz", { role: "applicant" });
check("admin targeting an unknown uid -> 404", r.status === 404, err(r));

// ---- everyone else ----
r = await patch(leadC, "u-new", { role: "applicant", team: "Combustion", system: "Body" });
check("system lead -> 403", r.status === 403 && !(await user("u-new")).memberProfile, err(r));
r = await patch(appC, "u-new", { role: "applicant", team: "Combustion", system: "Body" });
check("applicant -> 401/403", (r.status === 401 || r.status === 403) && !(await user("u-new")).memberProfile, err(r));

// restore
await patch(adminC, "u-lead-c", { role: "system_lead", team: "Combustion", system: "Body" });
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
