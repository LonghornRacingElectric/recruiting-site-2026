// Stats feature checks against the emulators: token gate, PII-free shape,
// staff gate, numbers match seeded data — including the per-step phase
// sections (review / interviews / decisions / emails) and the snapshot
// frozen by a forward step transition.
//
// Run against the emulator suite with the dev server started with
// STATS_API_TOKEN=test-stats-token (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/stats-regress.mjs
// Refuses to run without both emulator vars, so it can never touch production.
// Note: drives the recruiting step (ends at `interviewing`) — run it on a
// freshly seeded emulator, like the other suites.
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
for (const s of ["open", "reviewing", "release_interviews", "interviewing"]) await db.doc(`stats_snapshots/${s}`).delete();
await ensureUser({ uid: "s-lead", email: "lead.stats@utexas.edu", name: "Stats Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
for (let i = 0; i < 6; i++) await ensureUser({ uid: `s-app-${i}`, email: `stats${i}@utexas.edu`, name: `Person ${i} Secretname`, role: "applicant", createdAt: ago(30 - i * 5) });
await ensureUser({ uid: "s-app-old", email: "old@utexas.edu", name: "No CreatedAt", role: "applicant" }); // no createdAt
const A = (id, team, userId, status, ranked, createdH, submittedH, { formData = {}, ...extra } = {}) =>
  db.doc(`applications/${id}`).set({ team, userId, userEmail: `${userId}@utexas.edu`, userName: "Hidden Applicant", status, preferredSystems: ranked, createdAt: ago(createdH), ...(submittedH !== null ? { submittedAt: ago(submittedH) } : {}), formData: { major: "  Mechanical   Engineering ", graduationYear: "2028", resumeUrl: "https://x/r.pdf", ...formData }, ...extra });
const BLANK = { major: "", graduationYear: "", resumeUrl: "" }; // keep demographics/uploads assertions independent of the phase fixtures
await A("st-1", "Electric", "s-app-0", "submitted", ["Body", "Dynamics"], 30, 28);
await A("st-2", "Electric", "s-app-1", "submitted", ["Dynamics", "Body", "Powertrain"], 26, 20, { formData: { portfolioUrl: "https://x/p.pdf", major: "mechanical engineering" } });
await A("st-3", "Electric", "s-app-2", "in_progress", ["Body"], 10, null);
await A("st-4", "Solar", "s-app-0", "submitted", ["Powertrain"], 25, 0.5, { formData: { major: "ECE", graduationYear: "2027" } }); // s-app-0 applied to 2 teams; submitted in last hour
await A("st-5", "Combustion", "s-app-3", "in_progress", ["Aerodynamics", "Body"], 0.5, null);
await A("st-6", "Combustion", "s-app-4", "rejected", ["Aerodynamics"], 40, 39, { rejectedBySystems: ["Aerodynamics"], reviewDecision: "rejected" });
await A("st-fake", "Electric", "s-app-5", "submitted", ["Body"], 5, 4, { isFakeData: true }); // must be excluded
// Phase fixtures (unique userIds so cross-team counts stay legible):
await A("st-nr", "Electric", "nx-1", "submitted", [], 12, 11, { formData: BLANK }); // no ranking — invisible to leads
await A("st-i1", "Electric", "nx-2", "interview", ["Body", "Dynamics"], 20, 19, { formData: BLANK, reviewDecision: "advanced", interviewOffers: [{ system: "Body", status: "pending" }, { system: "Dynamics", status: "pending" }], emailsSent: ["interview_offered"] });
await A("st-i2", "Electric", "nx-3", "interview", ["Body"], 20, 19, { formData: BLANK, reviewDecision: "advanced", interviewOffers: [{ system: "Body", status: "pending" }, { system: "Powertrain", status: "cancelled" }], selectedInterviewSystem: "Body" });
await A("st-i3", "Solar", "nx-4", "interview", ["Powertrain", "TrackSim"], 20, 19, { formData: BLANK, reviewDecision: "advanced", interviewOffers: [{ system: "Powertrain", status: "completed" }, { system: "TrackSim", status: "no_show" }], emailsSent: ["interview_offered"] });
await A("st-d1", "Combustion", "nx-5", "accepted", ["Composites"], 20, 19, { formData: BLANK, reviewDecision: "advanced", interviewOffers: [{ system: "Composites", status: "completed" }], trialOffers: [{ system: "Composites", status: "pending" }], trialDecision: "advanced", trialDecisionDay: 2 });
await A("st-d2", "Combustion", "nx-6", "committed", ["Composites"], 20, 19, { formData: BLANK, trialDecision: "advanced", trialDecisionDay: 1, commitment: { accepted: true, committedAt: ago(1) }, renegedFrom: "Electric" });
await A("st-d3", "Combustion", "nx-7", "rejected", ["Body"], 20, 19, { formData: BLANK, trialDecision: "rejected", trialDecisionDay: 1, autoRejected: { reason: "offer_expired", at: ago(1) } });
await A("st-d4", "Solar", "nx-8", "waitlisted", ["Dynamics"], 20, 19, { formData: BLANK, trialDecision: "waitlisted" });
// Signup-link coverage: Body configured, Dynamics (live offers via st-i1) not.
await db.doc("interviewConfigs/electric-body").set({ team: "Electric", system: "Body", signupLink: "https://calendar.example.com/body" });
await db.doc("interviewConfigs/electric-dynamics").delete();

const adminC = await session("admin@utexas.edu"), leadC = await session("lead.stats@utexas.edu"), appC = await session("stats0@utexas.edu");
// Park the cycle at release_interviews (typed confirm covers any starting step)
// so offers are released and email eligibility is deterministic.
let r = await api("POST", "/api/admin/config/recruiting", { cookie: adminC, body: { step: "release_interviews", confirm: "release_interviews" } });
if (r.status !== 200) { console.error(`refusing: could not set step (${r.status} ${r.text})`); process.exit(1); }
await api("POST", "/api/admin/stats", { cookie: adminC }); // drop any cache from a previous run

// ---- /api/stats token gate ----
r = await api("GET", "/api/stats");
check("bot API without token -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { token: "wrong" });
check("bot API with wrong token -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { cookie: adminC });
check("bot API with a staff session but no token -> 401 (sessions don't count)", r.status === 401, `${r.status}`);
r = await api("GET", "/api/stats", { token: "test-stats-token" });
check("bot API with token -> 200", r.status === 200, `${r.status}`);
const pub = r.json;
check("bot API: no PII anywhere in the payload", !/utexas|Secretname|Hidden|s-app-|nx-|@/.test(r.text), r.text.slice(0, 120));
check("bot API: counts exclude fake data", pub?.applications?.total === 14 && pub.applications.byStatus.submitted === 4, JSON.stringify(pub?.applications?.byStatus));
check("bot API: per-team submitted is ever-submitted", pub?.applications?.byTeam?.Electric?.submitted === 5 && pub.applications.byTeam.Solar.submitted === 3 && pub.applications.byTeam.Combustion.submitted === 4 && pub.applications.submitted === 12, JSON.stringify(pub?.applications?.byTeam));
check("bot API: applicant accounts counted, staff not", pub?.applicantAccounts === 8, `${pub?.applicantAccounts}`); // seed applicant + 6 + old
check("bot API: velocity last hour (1 created, 1 submitted)", pub?.velocity?.createdLastHour === 1 && pub.velocity.submittedLastHour === 1, JSON.stringify(pub?.velocity));
check("bot API: system demand (Electric Body rank1 4 / any 5, Dynamics rank1 1)", pub?.systems?.Electric?.find((s) => s.system === "Body")?.rank1 === 4 && pub.systems.Electric.find((s) => s.system === "Dynamics")?.rank1 === 1 && pub.systems.Electric.find((s) => s.system === "Body")?.any === 5, JSON.stringify(pub?.systems?.Electric?.slice(0, 3)));
check("bot API: cross-team counts (1 applicant on 2 teams)", pub?.crossTeam?.[2] === 1 && pub.crossTeam[1] === 12, JSON.stringify(pub?.crossTeam));
check("bot API: no demographics or series in the reduced copy", pub && !("demographics" in pub) && !("series" in pub) && !("emails" in pub));
check("bot API: interview counts", pub?.interviews?.atInterview === 3 && pub.interviews.offersPending === 3 && pub.interviews.offersCompleted === 2 && pub.interviews.picked === 1 && pub.interviews.awaitingPick === 1, JSON.stringify(pub?.interviews));
check("bot API: decision counts", pub?.decisions?.committed === 1 && pub.decisions.declined === 0 && pub.decisions.awaitingResponse === 1 && pub.decisions.waitlisted === 1, JSON.stringify(pub?.decisions));

// ---- /api/admin/stats gate + full payload ----
r = await api("GET", "/api/admin/stats", { cookie: appC });
check("admin stats as applicant -> 403", r.status === 403, `${r.status}`);
r = await api("GET", "/api/admin/stats");
check("admin stats unauthenticated -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/admin/stats", { cookie: leadC });
check("admin stats as system lead -> 200 (all staff)", r.status === 200, `${r.status}`);
const full = r.json;
check("full stats: no PII either", !/utexas|Secretname|Hidden|s-app-|nx-|@/.test(r.text));
check("full stats: majors whitespace-normalised and case-folded (3 spellings -> one row, most common spelling shown)", full?.demographics?.major?.length === 2 && full.demographics.major[0].value === "Mechanical Engineering" && full.demographics.major[0].count === 3 && full.demographics.major[1].value === "ECE", JSON.stringify(full?.demographics?.major));
check("full stats: graduation years", full?.demographics?.graduationYear?.find((g) => g.value === "2028")?.count === 3 && full.demographics.graduationYear.find((g) => g.value === "2027")?.count === 1, JSON.stringify(full?.demographics?.graduationYear));
check("full stats: uploads among ever-submitted (4 resumes, 1 portfolio of 12)", full?.uploads?.submitted === 12 && full.uploads.resume === 4 && full.uploads.portfolio === 1, JSON.stringify(full?.uploads));
check("full stats: rejectedBy surfaces in system demand", full?.systems?.Combustion?.find((s) => s.system === "Aerodynamics")?.rejectedBy === 1, JSON.stringify(full?.systems?.Combustion?.find((s) => s.system === "Aerodynamics")));
check("full stats: single-team split (Electric 5, Solar 2, Combustion 5)", full?.crossTeam?.singleTeam?.Electric === 5 && full.crossTeam.singleTeam.Solar === 2 && full.crossTeam.singleTeam.Combustion === 5, JSON.stringify(full?.crossTeam?.singleTeam));
check("full stats: cross-team combo Electric+Solar = 1", full?.crossTeam?.combos?.[0]?.teams?.join("+") === "Electric+Solar" && full.crossTeam.combos[0].count === 1, JSON.stringify(full?.crossTeam?.combos));
const pts = full?.series?.points || [];
const sum = (k, team) => pts.reduce((a, p) => a + (team ? p[k][team] : Object.values(p[k]).reduce((x, y) => x + y, 0)), 0);
check("full stats: series totals reconcile (created 14, submitted 12, accounts 6 w/ createdAt)", sum("created") === 14 && sum("submitted") === 12 && pts.reduce((a, p) => a + p.accounts, 0) === 6, `created=${sum("created")} submitted=${sum("submitted")} accounts=${pts.reduce((a, p) => a + p.accounts, 0)}`);
check("full stats: series is sparse (fewer points than 15-min buckets over 40h)", pts.length > 0 && pts.length < 40 * 4, `${pts.length} points`);
check("full stats: accounts createdAt coverage reported (6 of 8)", full?.accounts?.applicantsWithCreatedAt === 6 && full.accounts.applicants === 8, JSON.stringify(full?.accounts));

// ---- phase sections ----
const rv = full?.review;
check("review: pending first review (st-1, st-2, st-4, st-nr)", rv?.pendingReview?.total === 4 && rv.pendingReview.byTeam.Electric === 3 && rv.pendingReview.byTeam.Solar === 1, JSON.stringify(rv?.pendingReview));
check("review: unranked submitted surfaces (st-nr)", rv?.unranked?.total === 1 && rv.unranked.byTeam.Electric === 1, JSON.stringify(rv?.unranked));
const bodyRow = rv?.bySystem?.Electric?.find((x) => x.system === "Body");
check("review: per-system pending is dashboard-verbatim (Body: 2 review, 2 decision)", bodyRow?.review === 2 && bodyRow?.decision === 2, JSON.stringify(bodyRow));
const iv = full?.interviews;
check("interviews: applicant funnel (3 at interview, 1 picked, 1 awaiting pick, 0 single-live)", iv?.atInterview?.total === 3 && iv.picked.total === 1 && iv.awaitingPick.total === 1 && iv.singleLive.total === 0, JSON.stringify({ at: iv?.atInterview?.total, picked: iv?.picked?.total, awaiting: iv?.awaitingPick?.total, single: iv?.singleLive?.total }));
check("interviews: offer status counts (3 pending, 2 completed, 1 cancelled, 1 no-show of 7)", iv?.offers?.pending === 3 && iv.offers.completed === 2 && iv.offers.cancelled === 1 && iv.offers.noShow === 1 && iv.offers.total === 7, JSON.stringify(iv?.offers));
check("interviews: per-team offers (Electric 3 pending / 1 cancelled)", iv?.offersByTeam?.Electric?.pending === 3 && iv.offersByTeam.Electric.cancelled === 1 && iv.offersByTeam.Solar.completed === 1 && iv.offersByTeam.Solar.noShow === 1, JSON.stringify(iv?.offersByTeam));
check("interviews: sweep preview matches the close-interviews predicate (only st-i1)", iv?.sweepPreview?.total === 1 && iv.sweepPreview.byTeam.Electric === 1, JSON.stringify(iv?.sweepPreview));
check("interviews: signup-link coverage flags Dynamics (2 needed, 1 with link)", iv?.signupLinks?.needed === 2 && iv.signupLinks.withLink === 1 && iv.signupLinks.missing.length === 1 && iv.signupLinks.missing[0].team === "Electric" && iv.signupLinks.missing[0].system === "Dynamics", JSON.stringify(iv?.signupLinks));
const bodyDemand = full?.systems?.Electric?.find((x) => x.system === "Body");
check("interviews: system demand carries offer outcomes + picks (Body: 2 pending, picked by 1)", bodyDemand?.intPending === 2 && bodyDemand?.picked === 1, JSON.stringify({ intPending: bodyDemand?.intPending, picked: bodyDemand?.picked }));
const dc = full?.decisions;
check("decisions: tallies (1 committed, 1 awaiting, 1 waitlisted, 0 declined)", dc?.committed?.total === 1 && dc.awaitingResponse.total === 1 && dc.waitlisted.total === 1 && dc.declined.total === 0, JSON.stringify({ c: dc?.committed?.total, a: dc?.awaitingResponse?.total, w: dc?.waitlisted?.total }));
check("decisions: trial decisions (2 advanced, 1 rejected, 1 waitlisted) + 1 trial offer", dc?.trialDecisions?.advanced?.total === 2 && dc.trialDecisions.rejected.total === 1 && dc.trialDecisions.waitlisted.total === 1 && dc.trialOffers.total === 1, JSON.stringify({ adv: dc?.trialDecisions?.advanced?.total, offers: dc?.trialOffers?.total }));
check("decisions: by-day funnel (day 1: 2 decided, 1 committed, 1 expired; day 2: 1 awaiting)", dc?.byDay?.["1"]?.decided === 2 && dc.byDay["1"].committed === 1 && dc.byDay["1"].expired === 1 && dc.byDay["2"].decided === 1 && dc.byDay["2"].awaiting === 1, JSON.stringify(dc?.byDay));
check("decisions: auto-reject reasons + reneg", dc?.autoRejected?.offerExpired === 1 && dc.autoRejected.committedElsewhere === 0 && dc.reneged === 1, JSON.stringify({ ...dc?.autoRejected, reneged: dc?.reneged }));
const cell = (trig, team) => full?.emails?.rows?.find((x) => x.trigger === trig && x.team === team);
check("emails: interview-offer coverage per team (E 1/2, S 1/1, C 0/1)", cell("interview_offered", "Electric")?.sent === 1 && cell("interview_offered", "Electric")?.eligible === 2 && cell("interview_offered", "Solar")?.sent === 1 && cell("interview_offered", "Solar")?.eligible === 1 && cell("interview_offered", "Combustion")?.sent === 0 && cell("interview_offered", "Combustion")?.eligible === 1, JSON.stringify(full?.emails?.rows?.filter((x) => x.trigger === "interview_offered")));
check("emails: released review rejection is owed a rejection email (st-6)", cell("rejected", "Combustion")?.eligible === 1 && cell("rejected", "Combustion")?.sent === 0, JSON.stringify(cell("rejected", "Combustion")));
check("emails: masked decisions owe nothing (trial rejection day 1 unreleased)", cell("rejected", "Electric")?.eligible === 0 && cell("accepted", "Combustion")?.eligible === 0, JSON.stringify([cell("rejected", "Electric"), cell("accepted", "Combustion")]));

// ---- snapshot on forward transition ----
r = await api("POST", "/api/admin/config/recruiting", { cookie: adminC, body: { step: "interviewing" } });
check("forward step change -> 200, no snapshot error", r.status === 200 && !r.json?.snapshotError, `${r.status} ${JSON.stringify(r.json)}`);
const snapDoc = await db.doc("stats_snapshots/release_interviews").get();
const snap = snapDoc.data();
check("snapshot frozen for the step being left", snapDoc.exists && snap?.snapshotStep === "release_interviews" && snap?.nextStep === "interviewing" && typeof snap?.capturedAt === "string" && typeof snap?.capturedBy === "string", JSON.stringify({ exists: snapDoc.exists, from: snap?.snapshotStep, to: snap?.nextStep }));
check("snapshot carries the counts (14 apps) but not the series", snap?.applications?.total === 14 && !("series" in (snap || {})) && snap?.interviews?.sweepPreview?.total === 1, JSON.stringify({ total: snap?.applications?.total, hasSeries: snap ? "series" in snap : null }));
r = await api("POST", "/api/admin/config/recruiting", { cookie: adminC, body: { step: "interviewing" } });
check("re-saving the same step (sweep recovery) captures nothing", r.status === 200 && !(await db.doc("stats_snapshots/interviewing").get()).exists, `${r.status}`);

// ---- snapshots API ----
r = await api("GET", "/api/admin/stats/snapshots");
check("snapshots unauthenticated -> 401", r.status === 401, `${r.status}`);
r = await api("GET", "/api/admin/stats/snapshots", { cookie: appC });
check("snapshots as applicant -> 403", r.status === 403, `${r.status}`);
r = await api("GET", "/api/admin/stats/snapshots", { cookie: leadC });
const listed = r.json?.snapshots?.find((s) => s.snapshotStep === "release_interviews");
check("snapshots as staff -> 200 with the frozen step", r.status === 200 && !!listed && listed.nextStep === "interviewing", `${r.status}`);
check("snapshots payload: no PII", !/utexas|Secretname|Hidden|s-app-|nx-|@/.test(r.text));

// ---- cache + refresh ----
await api("GET", "/api/admin/stats", { cookie: adminC }); // warm the cache (step changes invalidated it)
await A("st-7", "Solar", "s-app-5", "submitted", ["TrackSim"], 1, 0.2);
r = await api("GET", "/api/admin/stats", { cookie: adminC });
check("cached: new app not visible yet on GET", r.json?.applications?.total === 14, `${r.json?.applications?.total}`);
r = await api("POST", "/api/admin/stats", { cookie: adminC });
check("POST recompute -> 200 and sees the new app", r.status === 200 && r.json?.applications?.total === 15, `${r.status} ${r.json?.applications?.total}`);
r = await api("POST", "/api/admin/stats", { cookie: appC });
check("POST recompute as applicant -> 403", r.status === 403, `${r.status}`);

const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
