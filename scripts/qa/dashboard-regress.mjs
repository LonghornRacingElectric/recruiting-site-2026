// Dashboard pending counts are per-system for leads/reviewers and for a
// captain's breakdown (#131): a system's own rejection or offer takes an
// application out of THAT system's count even while the application is still
// globally submitted for other systems. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/dashboard-regress.mjs
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
const off = (system, st = "pending") => ({ system, status: st, createdAt: now() });
// A team of its own so other harnesses' leftovers can't change the counts.
const TEAM = "Solar";
const mk = (id, st, extra = {}) => db.doc(`applications/${id}`).set({ userId: `u-db-${id}`, userEmail: `${id}@utexas.edu`, userName: `Dash ${id}`, team: TEAM, preferredSystems: ["Dynamics", "Powertrain"], status: st, formData: { whyJoin: "x" }, createdAt: now(), updatedAt: now(), submittedAt: now(), ...extra });

// wipe any earlier run's Solar fixtures
for (const d of (await db.collection("applications").where("team", "==", TEAM).get()).docs) await d.ref.delete();

await ensureUser({ uid: "u-db-dyn", email: "db.dyn@utexas.edu", name: "Solar Dynamics Lead", role: "system_lead", memberProfile: { team: TEAM, system: "Dynamics" } });
await ensureUser({ uid: "u-db-pt", email: "db.pt@utexas.edu", name: "Solar Powertrain Lead", role: "system_lead", memberProfile: { team: TEAM, system: "Powertrain" } });
await ensureUser({ uid: "u-db-cap", email: "db.cap@utexas.edu", name: "Solar Captain", role: "team_captain_ob", memberProfile: { team: TEAM, system: "Aerodynamics" } });
const dynC = await session("db.dyn@utexas.edu"), ptC = await session("db.pt@utexas.edu"), capC = await session("db.cap@utexas.edu"), adminC = await session("admin@utexas.edu");

// Applications ranking Dynamics + Powertrain in every relevant state:
await mk("db-untouched", "submitted");                                                                   // nobody acted: review pending for both
await mk("db-dyn-rejected", "submitted", { rejectedBySystems: ["Dynamics"] });                            // Dynamics done, Powertrain not
await mk("db-dyn-rejected-2", "submitted", { rejectedBySystems: ["Dynamics"] });                          // another — makes the Dynamics count differ from the global one
await mk("db-pt-advanced", "interview", { reviewDecision: "advanced", interviewOffers: [off("Powertrain")] }); // Powertrain offered (decision pending); Dynamics still to review
await mk("db-dyn-advanced", "interview", { reviewDecision: "advanced", interviewOffers: [off("Dynamics", "completed")] }); // Dynamics interviewed (decision pending); Powertrain still to review
await mk("db-dyn-trial", "trial", { reviewDecision: "advanced", interviewDecision: "advanced", interviewOffers: [off("Dynamics", "completed")], trialOffers: [off("Dynamics")] }); // Dynamics' trial offer out: Dynamics owes the final decision; Powertrain never acted, still to review
await mk("db-dyn-cancelled", "interview", { reviewDecision: "advanced", interviewOffers: [off("Dynamics", "cancelled"), off("Powertrain")] }); // Dynamics' offer cancelled = back to review pending for Dynamics; Powertrain decision pending
await mk("db-dyn-noshow", "interview", { reviewDecision: "advanced", interviewOffers: [off("Dynamics", "no_show")] }); // no-show still Dynamics' offer: decision pending; Powertrain still to review
await mk("db-draft", "in_progress");                                                                     // drafts never count
await mk("db-accepted", "accepted", { reviewDecision: "advanced", interviewDecision: "advanced", trialDecision: "advanced", trialDecisionDay: 1, interviewOffers: [off("Dynamics", "completed")], trialOffers: [{ ...off("Dynamics"), accepted: true }], offer: { system: "Dynamics", role: "Member", issuedAt: now() } }); // decided
await mk("db-all-rejected", "rejected", { reviewDecision: "rejected", rejectedBySystems: ["Dynamics", "Powertrain"] }); // nothing pending anywhere
await mk("db-noranking", "submitted", { preferredSystems: [] });                                          // invisible to leads; surfaces only in the captain total

const counts = async (c) => (await api(c, "GET", "/api/admin/dashboard/pending-count")).json?.counts;
const dyn = await counts(dynC), pt = await counts(ptC), cap = await counts(capC), adm = await counts(adminC);
console.log("dyn", JSON.stringify(dyn), "\npt ", JSON.stringify(pt), "\ncap", JSON.stringify(cap));

// Dynamics: review = untouched, pt-advanced, dyn-cancelled = 3 (globally-submitted-undecided would be 4); decision = dyn-advanced, dyn-trial, dyn-noshow = 3
check("#131 Dynamics lead: pending reviews = only what Dynamics has not decided (3)", dyn?.pendingReviews?.total === 3, JSON.stringify(dyn?.pendingReviews));
check("#131 Dynamics lead: own rejections are NOT pending (globally-submitted-undecided for the team is 4)", dyn?.pendingReviews?.total === 3 && adm?.pendingReviews?.byGroup?.[TEAM] === 4, `dyn=${dyn?.pendingReviews?.total} globalSolar=${adm?.pendingReviews?.byGroup?.[TEAM]}`);
check("#131 Dynamics lead: pending decisions = live interview offer awaiting reject/trial, no-show included, and its own trial offer awaiting the final decision (3)", dyn?.pendingDecisions?.total === 3, JSON.stringify(dyn?.pendingDecisions));
// Powertrain: review = untouched, rej, rej2, dyn-advanced, dyn-trial, dyn-noshow = 6; decision = pt-advanced, dyn-cancelled = 2
check("#131 Powertrain lead: 6 pending reviews (untouched, both Dynamics-rejected, Dynamics-advanced, Dynamics-trial, Dynamics-no-show)", pt?.pendingReviews?.total === 6, JSON.stringify(pt?.pendingReviews));
check("#131 Powertrain lead: 2 pending decisions", pt?.pendingDecisions?.total === 2, JSON.stringify(pt?.pendingDecisions));
// a cancelled offer is no offer: Dynamics is review-pending on db-dyn-cancelled, not decision-pending (drop the cancelled clause and both counts move)
check("#131 cancelled offer counts as no offer (review 3 / decision 3 for Dynamics, not 2 / 4)", dyn?.pendingReviews?.total === 3 && dyn?.pendingDecisions?.total === 3);
// Captain: byGroup mirrors the leads; totals count applications with any system still to decide (+ the unranked one for reviews)
check("#131 captain breakdown matches each lead", cap?.pendingReviews?.byGroup?.Dynamics === 3 && cap?.pendingReviews?.byGroup?.Powertrain === 6 && cap?.pendingDecisions?.byGroup?.Dynamics === 3 && cap?.pendingDecisions?.byGroup?.Powertrain === 2, JSON.stringify(cap));
check("#131 captain totals = applications with at least one system still to decide, unranked submitted included (9 review, 5 decision)", cap?.pendingReviews?.total === 9 && cap?.pendingDecisions?.total === 5, JSON.stringify(cap));
check("#131 drafts and decided applications count nowhere", !Object.values(cap?.pendingReviews?.byGroup || {}).some((v) => v > 6) && cap?.pendingDecisions?.total === 5);
// Admin keeps the global meaning: submitted with no reviewDecision (untouched, both dyn-rejected, unranked) = 4 for Solar
check("admin by-team view unchanged: globally-submitted-undecided (4 for Solar)", adm?.pendingReviews?.byGroup?.[TEAM] === 4, JSON.stringify(adm?.pendingReviews?.byGroup));

const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
