// Stats feature checks against the emulators: token gate, PII-free shape,
// staff gate, numbers match seeded data.
//
// Run against the emulator suite with the dev server started with
// STATS_API_TOKEN=test-stats-token (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/stats-regress.mjs
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
async function ensureUser({ uid, email, name, role, memberProfile, createdAt }) {
  try { await auth.importUsers([{ uid, email, emailVerified: true, displayName: name, providerData: [{ uid: email, email, displayName: name, providerId: "google.com" }] }]); } catch {}
  await db.doc(`users/${uid}`).set({ uid, email, name, role, blacklisted: false, applications: [], phoneNumber: null, isMember: !!memberProfile, ...(memberProfile ? { memberProfile } : {}), ...(createdAt ? { createdAt } : {}) }, { merge: true });
}
async function session(email) {
  const r1 = await fetch(IDP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postBody: "id_token=" + encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true, name: email })) + "&providerId=google.com", requestUri: BASE, returnSecureToken: true }) });
  const j1 = await r1.json(); if (!j1.idToken) throw new Error("idp failed");
  const r2 = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: j1.idToken }) });
  if (r2.status !== 200) throw new Error(`session ${email} -> ${r2.status}`);
  return r2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
async function api(method, path, { cookie, token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie; if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const ago = (h) => new Date(Date.now() - h * 3600e3);

// ---- seed a known dataset ----
await db.doc("applications/st-7").delete(); // left over from a previous run
await ensureUser({ uid: "s-lead", email: "lead.stats@utexas.edu", name: "Stats Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
for (let i = 0; i < 6; i++) await ensureUser({ uid: `s-app-${i}`, email: `stats${i}@utexas.edu`, name: `Person ${i} Secretname`, role: "applicant", createdAt: ago(30 - i * 5) });
await ensureUser({ uid: "s-app-old", email: "old@utexas.edu", name: "No CreatedAt", role: "applicant" }); // no createdAt
const A = (id, team, userId, status, ranked, createdH, submittedH, { formData = {}, ...extra } = {}) =>
  db.doc(`applications/${id}`).set({ team, userId, userEmail: `${userId}@utexas.edu`, userName: "Hidden Applicant", status, preferredSystems: ranked, createdAt: ago(createdH), ...(submittedH !== null ? { submittedAt: ago(submittedH) } : {}), formData: { major: "  Mechanical   Engineering ", graduationYear: "2028", resumeUrl: "https://x/r.pdf", ...formData }, ...extra });
await A("st-1", "Electric", "s-app-0", "submitted", ["Body", "Dynamics"], 30, 28);
await A("st-2", "Electric", "s-app-1", "submitted", ["Dynamics", "Body", "Powertrain"], 26, 20, { formData: { portfolioUrl: "https://x/p.pdf", major: "mechanical engineering" } });
await A("st-3", "Electric", "s-app-2", "in_progress", ["Body"], 10, null);
await A("st-4", "Solar", "s-app-0", "submitted", ["Powertrain"], 25, 0.5, { formData: { major: "ECE", graduationYear: "2027" } }); // s-app-0 applied to 2 teams; submitted in last hour
await A("st-5", "Combustion", "s-app-3", "in_progress", ["Aerodynamics", "Body"], 0.5, null);
await A("st-6", "Combustion", "s-app-4", "rejected", ["Aerodynamics"], 40, 39, { rejectedBySystems: ["Aerodynamics"], reviewDecision: "rejected" });
await A("st-fake", "Electric", "s-app-5", "submitted", ["Body"], 5, 4, { isFakeData: true }); // must be excluded

const adminC = await session("admin@utexas.edu"), leadC = await session("lead.stats@utexas.edu"), appC = await session("stats0@utexas.edu");
await api("POST", "/api/admin/stats", { cookie: adminC }); // drop any cache from a previous run

// ---- /api/stats token gate ----
let r = await api("GET", "/api/stats");
check("bot API without token -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { token: "wrong" });
check("bot API with wrong token -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { cookie: adminC });
check("bot API with a staff session but no token -> 401 (sessions don't count)", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { token: "test-stats-token" });
check("bot API with token -> 200", r.status === 200, `${r.status}`);
const pub = r.json;
check("bot API: no PII anywhere in the payload", !/utexas|Secretname|Hidden|s-app-|@/.test(r.text) && !/email|name|userId|uid/i.test(Object.keys(JSON.stringify(pub)).join("")), r.text.slice(0, 120));
check("bot API: counts exclude fake data", pub?.applications?.total === 6 && pub.applications.byStatus.submitted === 3, JSON.stringify(pub?.applications?.byStatus));
check("bot API: per-team submitted is ever-submitted (rejected Combustion app counts)", pub?.applications?.byTeam?.Electric?.submitted === 2 && pub.applications.byTeam.Solar.submitted === 1 && pub.applications.byTeam.Combustion.submitted === 1 && pub.applications.submitted === 4, JSON.stringify(pub?.applications?.byTeam));
check("bot API: applicant accounts counted, staff not", pub?.applicantAccounts === 8, `${pub?.applicantAccounts}`); // seed applicant + 6 + old
check("bot API: velocity last hour (1 created, 1 submitted)", pub?.velocity?.createdLastHour === 1 && pub.velocity.submittedLastHour === 1, JSON.stringify(pub?.velocity));
check("bot API: system demand rank1 (Electric Body = 2, Dynamics = 1, Body any = 3)", pub?.systems?.Electric?.find((s) => s.system === "Body")?.rank1 === 2 && pub.systems.Electric.find((s) => s.system === "Dynamics")?.rank1 === 1 && pub.systems.Electric.find((s) => s.system === "Body")?.any === 3, JSON.stringify(pub?.systems?.Electric?.slice(0, 3)));
check("bot API: cross-team counts (1 applicant on 2 teams)", pub?.crossTeam?.[2] === 1 && pub.crossTeam[1] === 4, JSON.stringify(pub?.crossTeam));
check("bot API: no demographics or series in the reduced copy", pub && !("demographics" in pub) && !("series" in pub));

// ---- /api/admin/stats gate + full payload ----
r = await api("GET", "/api/admin/stats", { cookie: appC });
check("admin stats as applicant -> 403", r.status === 403, `${r.status}`);
r = await api("GET", "/api/admin/stats");
check("admin stats unauthenticated -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/admin/stats", { cookie: leadC });
check("admin stats as system lead -> 200 (all staff)", r.status === 200, `${r.status}`);
const full = r.json;
check("full stats: no PII either", !/utexas|Secretname|Hidden|s-app-|@/.test(r.text));
check("full stats: majors whitespace-normalised and case-folded (3 spellings -> one row, most common spelling shown)", full?.demographics?.major?.length === 2 && full.demographics.major[0].value === "Mechanical Engineering" && full.demographics.major[0].count === 3 && full.demographics.major[1].value === "ECE", JSON.stringify(full?.demographics?.major));
check("full stats: graduation years", full?.demographics?.graduationYear?.find((g) => g.value === "2028")?.count === 3 && full.demographics.graduationYear.find((g) => g.value === "2027")?.count === 1, JSON.stringify(full?.demographics?.graduationYear));
check("full stats: uploads among ever-submitted (4 resumes, 1 portfolio of 4)", full?.uploads?.submitted === 4 && full.uploads.resume === 4 && full.uploads.portfolio === 1, JSON.stringify(full?.uploads));
check("full stats: rejectedBy surfaces in system demand", full?.systems?.Combustion?.find((s) => s.system === "Aerodynamics")?.rejectedBy === 1, JSON.stringify(full?.systems?.Combustion?.find((s) => s.system === "Aerodynamics")));
check("full stats: single-team split (Electric 2, Solar 0, Combustion 2)", full?.crossTeam?.singleTeam?.Electric === 2 && full.crossTeam.singleTeam.Solar === 0 && full.crossTeam.singleTeam.Combustion === 2, JSON.stringify(full?.crossTeam?.singleTeam));
check("full stats: cross-team combo Electric+Solar = 1", full?.crossTeam?.combos?.[0]?.teams?.join("+") === "Electric+Solar" && full.crossTeam.combos[0].count === 1, JSON.stringify(full?.crossTeam?.combos));
const pts = full?.series?.points || [];
const sum = (k, team) => pts.reduce((a, p) => a + (team ? p[k][team] : Object.values(p[k]).reduce((x, y) => x + y, 0)), 0);
check("full stats: series totals reconcile (created 6, submitted 3+1 rejected-was-submitted, accounts 6 w/ createdAt)", sum("created") === 6 && sum("submitted") === 4 && pts.reduce((a, p) => a + p.accounts, 0) === 6, `created=${sum("created")} submitted=${sum("submitted")} accounts=${pts.reduce((a, p) => a + p.accounts, 0)}`);
check("full stats: series is sparse (fewer points than 15-min buckets over 40h)", pts.length > 0 && pts.length < 40 * 4, `${pts.length} points`);
check("full stats: accounts createdAt coverage reported (6 of 8)", full?.accounts?.applicantsWithCreatedAt === 6 && full.accounts.applicants === 8, JSON.stringify(full?.accounts));

// ---- cache + refresh ----
await A("st-7", "Solar", "s-app-5", "submitted", ["TrackSim"], 1, 0.2);
r = await api("GET", "/api/admin/stats", { cookie: adminC });
check("cached: new app not visible yet on GET", r.json?.applications?.total === 6, `${r.json?.applications?.total}`);
r = await api("POST", "/api/admin/stats", { cookie: adminC });
check("POST recompute -> 200 and sees the new app", r.status === 200 && r.json?.applications?.total === 7, `${r.status} ${r.json?.applications?.total}`);
r = await api("POST", "/api/admin/stats", { cookie: appC });
check("POST recompute as applicant -> 403", r.status === 403, `${r.status}`);

const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
