// QA backlog sweep (#58 #59 #60 #61 #62 #64 #65 #66 #70 #72 #73 #74 #75):
// release-day tagging and per-day offer masking, expired sessions as 401s,
// cookie lifetime in seconds, question-cache invalidation and merge writes,
// other-team masking for non-admins, the one-run-at-a-time email lock, a
// single-request commit that declines the rest server-side, the
// conflict-guarded status write, the real refresh cooldown, one session
// verification per page, config-keyed CSV columns, form-data size caps, and
// the staff cancel reason staying internal. Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/backlog-regress.mjs
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
async function sessionResponse(email) {
  const r1 = await fetch(IDP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postBody: "id_token=" + encodeURIComponent(JSON.stringify({ sub: email, email, email_verified: true, name: email })) + "&providerId=google.com", requestUri: BASE, returnSecureToken: true }) });
  const j1 = await r1.json(); if (!j1.idToken) throw new Error("idp failed");
  const r2 = await fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: j1.idToken }) });
  if (r2.status !== 200) throw new Error(`session ${email} -> ${r2.status}`);
  return r2;
}
async function session(email) { return (await sessionResponse(email)).headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); }
async function api(cookie, method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}
const now = () => new Date();
const get = async (id) => (await db.doc(`applications/${id}`).get()).data();
const setStep = (c, step) => api(c, "POST", "/api/admin/config/recruiting", { step, confirm: step });
const err = (r) => `${r.status} ${r.json?.error || ""}`;
const status = (c, id, body) => api(c, "POST", `/api/admin/applications/${id}/status`, body);
const off = (system, st = "pending", extra = {}) => ({ system, status: st, createdAt: now(), ...extra });
const COMPLETE = { whyJoin: "why", relevantExperience: "exp", availability: "5551234567", graduationYear: "2029", major: "ME", resumeUrl: "https://example.test/resume.pdf", portfolioUrl: "", teamQuestions: { electric_skills: "skills" }, customAnswers: {} };

await ensureUser({ uid: "u-bl-app", email: "bl-app@utexas.edu", name: "Backlog Applicant", role: "applicant" });
await ensureUser({ uid: "u-bl-app2", email: "bl-app2@utexas.edu", name: "Backlog Committer", role: "applicant" });
await ensureUser({ uid: "u-bl-lead", email: "bl-lead@utexas.edu", name: "Body Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
const adminC = await session("admin@utexas.edu"), appC = await session("bl-app@utexas.edu"), app2C = await session("bl-app2@utexas.edu"), leadC = await session("bl-lead@utexas.edu");
const mk = async (id, uid, team, systems, st, extra = {}) => { await db.doc(`applications/${id}`).set({ userId: uid, userEmail: `${uid.replace("u-", "")}@utexas.edu`, userName: uid, team, preferredSystems: systems, status: st, formData: COMPLETE, createdAt: now(), updatedAt: now(), ...(st !== "in_progress" ? { submittedAt: now() } : {}), ...extra }); };
let r;

// ---- #59: an authentication failure is a 401 (the fetcher logs out on 401, not 403) ----
r = await api("", "GET", "/api/admin/applications?all=true");
check("#59 no session cookie on an admin route -> 401", r.status === 401, err(r));
r = await api("session=not-a-real-cookie", "GET", "/api/admin/applications?all=true");
check("#59 an unverifiable session cookie -> 401, not 500", r.status === 401, err(r));
r = await api("session=not-a-real-cookie", "GET", "/api/admin/config/recruiting");
check("#59 same on a config route", r.status === 401, err(r));
r = await api("session=not-a-real-cookie", "POST", "/api/admin/applications/refresh");
check("#59 and on a POST", r.status === 401, err(r));
r = await api(appC, "GET", "/api/admin/applications?all=true");
check("#59 a signed-in applicant is still a 403 (authorisation, not authentication)", r.status === 403, err(r));
r = await api("session=not-a-real-cookie", "POST", "/api/applications/whatever/commit", { accepted: true });
check("#59 the commit route: a dead cookie is a 401, not a 400 carrying Firebase's message", r.status === 401 && r.json?.error === "Unauthorized", err(r));
{
  const res = await sessionResponse("bl-app@utexas.edu");
  const cookies = res.headers.getSetCookie();
  const sessionCookie = cookies.find((c) => c.startsWith("session=")) || "";
  const roleCookie = cookies.find((c) => c.startsWith("user_role=")) || "";
  check("#59 session cookie Max-Age is seconds (5 days = 432000), not milliseconds", /max-age=432000(;|$)/i.test(sessionCookie), sessionCookie.replace(/^session=[^;]*/, "session=…"));
  check("#59 session cookie is SameSite=Lax", /samesite=lax/i.test(sessionCookie), sessionCookie.replace(/^session=[^;]*/, "session=…"));
  check("#59 user_role cookie carries the same lifetime", /max-age=432000(;|$)/i.test(roleCookie), roleCookie);
}

// ---- #74: form-data size caps (applications open) ----
r = await setStep(adminC, "open"); check("step -> open", r.status === 200, err(r));
await mk("bl-cap", "u-bl-app", "Electric", ["Body", "Dynamics"], "submitted");
await db.doc("users/u-bl-app").set({ applications: ["bl-cap"] }, { merge: true });
r = await api(appC, "PATCH", "/api/applications/bl-cap", { formData: { whyJoin: "x".repeat(30_000) } });
let d = await get("bl-cap");
check("#74 a 30k-character answer saves clipped to 20k", r.status === 200 && d.formData.whyJoin.length === 20_000, `${err(r)} len=${d.formData.whyJoin?.length}`);
const bag = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, "v"]));
bag["k".repeat(80)] = "long key";
r = await api(appC, "PATCH", "/api/applications/bl-cap", { formData: { customAnswers: bag } });
d = await get("bl-cap");
check("#74 customAnswers capped at 100 entries; an 80-char key is dropped", r.status === 200 && Object.keys(d.formData.customAnswers).length === 100 && !("k".repeat(80) in d.formData.customAnswers), `${err(r)} n=${Object.keys(d.formData.customAnswers || {}).length}`);
r = await api(appC, "PATCH", "/api/applications/bl-cap", { formData: { whyJoin: "normal", customAnswers: { q_1: "fine" } } });
d = await get("bl-cap");
check("#74 ordinary answers are untouched", r.status === 200 && d.formData.whyJoin === "normal" && d.formData.customAnswers.q_1 === "fine", err(r));
const huge = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`h${i}`, "y".repeat(19_000)]));
r = await api(appC, "PATCH", "/api/applications/bl-cap", { formData: { customAnswers: huge } });
d = await get("bl-cap");
check("#74 a payload that would approach Firestore's 1 MB limit -> 400, nothing written", r.status === 400 && d.formData.customAnswers.q_1 === "fine" && Object.keys(d.formData.customAnswers).length === 1, `${err(r)} n=${Object.keys(d.formData.customAnswers || {}).length}`);

// ---- #62: other-team badges are masked for non-admins ----
await mk("bl-e", "u-bl-app", "Electric", ["Body"], "submitted", { originalPreferredSystems: ["Body", "Dynamics"], formData: { ...COMPLETE, teamQuestions: { electric_skills: "skills-bl-e" } } });
await mk("bl-s", "u-bl-app", "Solar", ["Aerodynamics"], "waitlisted", { trialDecision: "waitlisted", waitlistSystem: "Aerodynamics" });
await db.doc("users/u-bl-app").set({ applications: ["bl-cap", "bl-e", "bl-s"] }, { merge: true });
r = await api(leadC, "GET", "/api/admin/applications?all=true");
let row = (r.json?.applications || []).find((a) => a.id === "bl-e");
let other = row?.otherTeams?.find((o) => o.team === "Solar");
check("#62 lead sees the other-team badge…", r.status === 200 && !!other, `${err(r)} ${JSON.stringify(row?.otherTeams)}`);
check("#62 …with the waitlist masked as 'inactive' and no application id", !!other && other.status === "inactive" && !("id" in other), JSON.stringify(other));
r = await api(adminC, "GET", "/api/admin/applications/bl-e/related");
other = (r.json?.applications || []).find((o) => o.team === "Solar");
check("#62 admin sees the real status and the id (related route; the admin list already holds every team)", r.status === 200 && !!other && other.status === "waitlisted" && other.id === "bl-s", `${err(r)} ${JSON.stringify(other)}`);
r = await api(leadC, "GET", "/api/admin/applications/bl-e/related");
other = (r.json?.applications || []).find((o) => o.team === "Solar");
check("#62 the related route masks the same way for a lead", r.status === 200 && !!other && other.status === "inactive" && !("id" in other), `${err(r)} ${JSON.stringify(other)}`);

// ---- #75: the staff cancel reason never reaches the applicant ----
r = await setStep(adminC, "interviewing"); check("step -> interviewing", r.status === 200, err(r));
await db.doc("applications/bl-e").set({ status: "interview", reviewDecision: "advanced", interviewOffers: [off("Body", "cancelled", { cancelledAt: now(), cancelReason: "rude in the hallway" }), off("Dynamics")] }, { merge: true });
r = await api(appC, "GET", "/api/applications/bl-e");
{
  const offers = r.json?.application?.interviewOffers || [];
  const cancelled = offers.find((o) => o.system === "Body");
  check("#75 applicant payload carries the cancelled offer without its cancelReason", r.status === 200 && offers.length === 2 && cancelled?.status === "cancelled" && !("cancelReason" in cancelled), `${err(r)} ${JSON.stringify(cancelled)}`);
}
r = await api(adminC, "GET", "/api/admin/applications/bl-e/details");
check("#75 staff still see the reason", r.status === 200 && (r.json?.application?.interviewOffers || []).some((o) => o.cancelReason === "rude in the hallway"), err(r));
r = await api(appC, "GET", "/api/applications/bl-e/interview");
check("#75 the scheduler's own route (what the applicant UI reads) carries no cancelReason either", r.status === 200 && (r.json?.offers || []).length === 2 && r.json.offers.every((o) => !("cancelReason" in o)), `${err(r)} ${JSON.stringify(r.json?.offers?.map((o) => Object.keys(o)))}`);

// ---- #58: release day is chosen, not inferred; offers unmask on their own day ----
r = await setStep(adminC, "trial_workday"); check("step -> trial_workday", r.status === 200, err(r));
const trialFixture = (systems) => ({ reviewDecision: "advanced", interviewDecision: "advanced", interviewOffers: systems.map((s) => off(s, "completed")), trialOffers: systems.map((s) => off(s, "pending", { accepted: true })) });
await mk("bl-acc", "u-bl-app2", "Electric", ["Dynamics"], "trial", trialFixture(["Dynamics"]));
await mk("bl-wl", "u-bl-app2", "Combustion", ["Aerodynamics"], "trial", trialFixture(["Aerodynamics"]));
await mk("bl-inf", "u-bl-app", "Electric", ["Dynamics"], "trial", trialFixture(["Dynamics"]));
await mk("bl-rej", "u-bl-app", "Combustion", ["Aerodynamics"], "trial", trialFixture(["Aerodynamics"]));
await mk("bl-acc-solar", "u-bl-app2", "Solar", ["Aerodynamics"], "accepted", { ...trialFixture(["Aerodynamics"]), trialDecision: "advanced", trialDecisionDay: 1, offer: { system: "Aerodynamics", role: "Member", issuedAt: now() } });
await db.doc("users/u-bl-app2").set({ applications: ["bl-acc", "bl-wl", "bl-acc-solar"] }, { merge: true });
await db.doc("users/u-bl-app").set({ applications: ["bl-cap", "bl-e", "bl-s", "bl-inf", "bl-rej"] }, { merge: true });
r = await status(adminC, "bl-acc", { status: "accepted", offer: { system: "Dynamics", role: "Member", details: "" }, releaseDay: 2 });
d = await get("bl-acc");
check("#58 accept with releaseDay 2 during trial_workday -> tagged day 2 (inference said 1)", r.status === 200 && d.status === "accepted" && d.trialDecisionDay === 2 && d.offer?.system === "Dynamics", `${err(r)} day=${d.trialDecisionDay}`);
r = await status(adminC, "bl-wl", { status: "waitlisted", offer: { system: "Aerodynamics", details: "" }, releaseDay: 5 });
check("#58 releaseDay 5 -> 400, nothing written", r.status === 400 && (await get("bl-wl")).status === "trial", err(r));
r = await status(adminC, "bl-wl", { status: "waitlisted", offer: { system: "Aerodynamics", details: "" }, releaseDay: 3 });
d = await get("bl-wl");
check("#58 waitlist with releaseDay 3 -> day 3", r.status === 200 && d.status === "waitlisted" && d.trialDecisionDay === 3, `${err(r)} day=${d.trialDecisionDay}`);
r = await status(adminC, "bl-inf", { status: "accepted", offer: { system: "Dynamics", role: "Member", details: "" } });
d = await get("bl-inf");
check("#58 no releaseDay -> the step-based default (day 1) still applies", r.status === 200 && d.trialDecisionDay === 1, `${err(r)} day=${d.trialDecisionDay}`);
r = await api(adminC, "POST", "/api/admin/applications/bl-rej/reject", { systems: ["Aerodynamics"], releaseDay: 3 });
d = await get("bl-rej");
check("#58 a trial-stage rejection takes releaseDay too", r.status === 200 && d.status === "rejected" && d.trialDecision === "rejected" && d.trialDecisionDay === 3, `${err(r)} ${d.status} day=${d.trialDecisionDay}`);
r = await api(adminC, "POST", "/api/admin/applications/bl-rej/reject", { systems: ["Aerodynamics"], releaseDay: 0 });
check("#58 reject with releaseDay 0 -> 400", r.status === 400, err(r));
await mk("bl-strag", "u-bl-app", "Electric", ["Dynamics"], "submitted");
r = await status(adminC, "bl-strag", { status: "rejected", releaseDay: 2 });
check("#58 releaseDay on a non-trial decision (a straggler still at review) -> 400, nothing written", r.status === 400 && /trial-stage/.test(r.json?.error || "") && (await get("bl-strag")).status === "submitted", err(r));
r = await api(adminC, "POST", "/api/admin/applications/bl-strag/reject", { systems: ["Dynamics"], releaseDay: 2 });
check("#58 same via /reject", r.status === 400 && (await get("bl-strag")).status === "submitted", err(r));
r = await status(adminC, "bl-wl", { status: "accepted", offer: { system: "Aerodynamics", role: "Member", details: "" }, releaseDay: true });
check("#58 releaseDay: true -> 400 (not coerced to 1)", r.status === 400 && (await get("bl-wl")).status === "waitlisted", err(r));
// masking: a day-2 acceptance during trial_workday and on day 1
r = await api(app2C, "GET", "/api/applications/bl-acc");
check("#58 trial_workday: applicant sees no acceptance and no offer", r.status === 200 && r.json?.application?.status !== "accepted" && !("offer" in (r.json?.application || {})), `${err(r)} ${r.json?.application?.status} offer=${"offer" in (r.json?.application || {})}`);
r = await setStep(adminC, "release_decisions_day1"); check("step -> release_decisions_day1", r.status === 200, err(r));
r = await api(app2C, "GET", "/api/applications/bl-acc");
check("#58 day 1: a day-2 acceptance is still masked AND its offer is absent from the payload (the leak)", r.status === 200 && r.json?.application?.status !== "accepted" && !("offer" in (r.json?.application || {})), `${err(r)} ${r.json?.application?.status} offer=${"offer" in (r.json?.application || {})}`);
r = await api(app2C, "GET", "/api/applications/bl-acc-solar");
check("#58 day 1: a day-1 acceptance is visible with its offer", r.status === 200 && r.json?.application?.status === "accepted" && r.json?.application?.offer?.system === "Aerodynamics", `${err(r)} ${r.json?.application?.status}`);
r = await api(app2C, "POST", "/api/applications/bl-acc/commit", { accepted: true });
check("#58 day 1: the masked day-2 offer cannot be committed to", r.status === 400 && (await get("bl-acc")).status === "accepted", err(r));
// An uncommitted day-1 offer expires when day 2 opens (the transition sweep) —
// keep the Solar acceptance alive for the commit test by making it a day-2 offer too.
await db.doc("applications/bl-acc-solar").set({ trialDecisionDay: 2 }, { merge: true });
r = await setStep(adminC, "release_decisions_day2"); check("step -> release_decisions_day2", r.status === 200, err(r));
r = await api(app2C, "GET", "/api/applications/bl-acc");
check("#58 day 2: the day-2 acceptance and its offer are visible", r.status === 200 && r.json?.application?.status === "accepted" && r.json?.application?.offer?.system === "Dynamics", `${err(r)} ${r.json?.application?.status}`);

// ---- #65: one commit request declines the other offers server-side, with reasons ----
r = await api(app2C, "POST", "/api/applications/bl-acc/commit", { accepted: true, declineReasons: { "bl-acc-solar": "  Chose Electric  ", "nope": "ignored", "bl-wl": 42 } });
d = await get("bl-acc"); let ds = await get("bl-acc-solar");
check("#65 commit -> 200; chosen application committed", r.status === 200 && d.status === "committed" && d.commitment?.accepted === true, `${err(r)} ${d.status}`);
check("#65 the other accepted offer is declined in the same transaction, with the applicant's reason", ds.status === "declined" && ds.commitment?.accepted === false && ds.commitment?.reason === "Chose Electric", `${ds.status} ${JSON.stringify(ds.commitment)}`);
check("#65 the waitlisted application is untouched", (await get("bl-wl")).status === "waitlisted");
check("#65 commit response is sanitised (no decisions)", r.json?.application && !("trialDecision" in r.json.application) && !("aggregateRatings" in r.json.application));

// ---- #66: two staff deciding on one applicant at the same moment ----
r = await setStep(adminC, "trial_workday"); check("step -> trial_workday (race fixture)", r.status === 200, err(r));
await mk("bl-race", "u-bl-app", "Electric", ["Body", "Dynamics"], "trial", trialFixture(["Body", "Dynamics"]));
{
  const [a, b] = await Promise.all([
    status(adminC, "bl-race", { status: "accepted", offer: { system: "Body", role: "Member", details: "" } }),
    status(adminC, "bl-race", { status: "waitlisted", offer: { system: "Dynamics", details: "" } }),
  ]);
  const final = await get("bl-race");
  const codes = [a.status, b.status];
  const oneWon = codes.filter((c) => c === 200).length === 1 && codes.includes(409);
  const winnerMatches = a.status === 200 ? final.status === "accepted" && final.offer?.system === "Body" : final.status === "waitlisted" && !final.offer;
  const serialised = a.status === 200 && b.status === 200 && final.status === "waitlisted" && !final.offer;
  check("#66 concurrent accept + waitlist: one 200 and one 409 with the winner's state, or a clean serial rescind — never two silent 200s over each other", (oneWon && winnerMatches) || serialised, `codes=${codes.join(",")} final=${final.status} offer=${JSON.stringify(final.offer || null)} ${a.json?.error || ""} ${b.json?.error || ""}`);
  if (codes.includes(409)) check("#66 the 409 says what to do", /reload/i.test((a.status === 409 ? a : b).json?.error || ""), (a.status === 409 ? a : b).json?.error);
}

// ---- #64: one email run at a time ----
await db.doc("config/email_run_lock").set({ by: "someone-else", step: "trial_workday", startedAt: now(), lockedUntil: new Date(Date.now() + 10 * 60 * 1000) });
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"] });
check("#64 a run while another holds the lock -> 409", r.status === 409 && /already in progress/i.test(r.json?.error || ""), err(r));
check("#64 the refused run leaves the holder's lock alone", (await db.doc("config/email_run_lock").get()).data()?.by === "someone-else");
await db.doc("config/email_run_lock").set({ by: "crashed-tab", runId: "dead-run", step: "trial_workday", startedAt: new Date(Date.now() - 60 * 60 * 1000), lockedUntil: new Date(Date.now() - 45 * 60 * 1000) });
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"] });
check("#64 an expired lock (a run that died) does not block; the run proceeds", r.status !== 409, err(r));
check("#64 a single un-batched request releases the lock when it ends", !(await db.doc("config/email_run_lock").get()).exists);
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"], runId: "run-A", last: false });
check("#64 batch 1 of run A -> 200 and the lock is held for the run", r.status === 200 && (await db.doc("config/email_run_lock").get()).data()?.runId === "run-A", err(r));
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"], runId: "run-B", last: false });
check("#64 run B (another admin/tab) meanwhile -> 409", r.status === 409, err(r));
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"], runId: "run-A", last: false });
check("#64 batch 2 of run A re-enters its own lock -> 200", r.status === 200, err(r));
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"] });
check("#64 an un-batched run while A is in progress -> 409 (and it does not steal the lock)", r.status === 409 && (await db.doc("config/email_run_lock").get()).data()?.runId === "run-A", err(r));
r = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: ["does-not-exist"], runId: "run-A", last: true });
check("#64 the last batch of run A releases the lock", r.status === 200 && !(await db.doc("config/email_run_lock").get()).exists, err(r));
{
  const lockDoc = (await db.doc("config/email_run_lock").get()).data();
  check("#64 lock has a batch-sized expiry, so a batch killed by a timeout frees the run within minutes", !lockDoc, "");
}

// ---- #70: the refresh cooldown the button reports is the one the POST enforces ----
r = await status(adminC, "bl-inf", { status: "waitlisted", offer: { system: "Dynamics", details: "" } });
check("#70 (fixture) a status change lands", r.status === 200, err(r));
r = await api(adminC, "GET", "/api/admin/applications/refresh");
check("#70 a staff status change does not start the refresh cooldown (the button stays usable during review)", r.status === 200 && r.json?.cooldownRemaining === 0 && r.json?.canRefresh === true, JSON.stringify(r.json));
r = await api(adminC, "POST", "/api/admin/applications/refresh");
check("#70 refresh -> 200 (the cooldown is fresh for the whole harness)", r.status === 200, err(r));
r = await api(adminC, "POST", "/api/admin/applications/refresh");
check("#70 a second refresh inside the cooldown -> 429 with the seconds left", r.status === 429 && r.json?.cooldownRemaining >= 1, `${err(r)} remaining=${r.json?.cooldownRemaining}`);
r = await api(adminC, "GET", "/api/admin/applications/refresh");
check("#70 GET reports the same cooldown (was hardcoded 0)", r.status === 200 && r.json?.cooldownRemaining >= 1 && r.json?.canRefresh === false, JSON.stringify(r.json));

// ---- #73: CSV columns come from the config ----
{
  const res = await fetch(`${BASE}/api/admin/applications/export-csv`, { method: "POST", headers: { "Content-Type": "application/json", cookie: adminC }, body: JSON.stringify({ teams: ["Electric"] }) });
  const text = await res.text();
  const parse = (line) => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parse(lines[0]);
  const skillsCol = header.indexOf("Electric Q: What relevant electrical/software skills do you have?");
  const origCol = header.indexOf("Original Preferred Systems");
  check("#73 export -> 200 text/csv", res.status === 200 && /text\/csv/.test(res.headers.get("content-type") || ""), `${res.status} ${res.headers.get("content-type")}`);
  check("#73 header has a config-labelled column per team question, no 'Team Question 1/2'", skillsCol >= 0 && !header.includes("Team Question 1") && !header.includes("Team Question 2"), header.filter((h) => /Q:|Team Question/.test(h)).join(" | "));
  check("#73 header has 'Original Preferred Systems'", origCol >= 0);
  const rowE = lines.map(parse).find((cells) => cells.includes("skills-bl-e"));
  check("#73 the row's team answer sits under its own question's column", !!rowE && rowE[skillsCol] === "skills-bl-e", rowE ? `got=${JSON.stringify(rowE[skillsCol])}` : "row bl-e not found");
  check("#73 original ranking exported even after it was narrowed", !!rowE && rowE[origCol] === "Body; Dynamics", rowE ? JSON.stringify(rowE[origCol]) : "");
  check("#73 a single-team export carries only that team's question columns", header.some((h) => h.startsWith("Electric Q:")) && !header.some((h) => h.startsWith("Solar Q:") || h.startsWith("Combustion Q:")), header.filter((h) => /Q:/.test(h)).join(" | "));
  const otherCol = header.indexOf("Other Team Answers");
  await db.doc("applications/bl-e").set({ formData: { ...COMPLETE, teamQuestions: { electric_skills: "skills-bl-e", q_deleted_123: "answer to a question that no longer exists" } } }, { merge: true });
  const res2 = await fetch(`${BASE}/api/admin/applications/export-csv`, { method: "POST", headers: { "Content-Type": "application/json", cookie: adminC }, body: JSON.stringify({ teams: ["Electric"] }) });
  const rowE2 = (await res2.text()).split(/\r?\n/).filter(Boolean).map(parse).find((cells) => cells.includes("skills-bl-e"));
  check("#73 an answer under a question id the config no longer has is not dropped", otherCol >= 0 && !!rowE2 && rowE2[otherCol] === "q_deleted_123: answer to a question that no longer exists", rowE2 ? JSON.stringify(rowE2[otherCol]) : "row not found");
}

// ---- #60/#61: question edits reach the applicant route at once; writes merge ----
{
  r = await api(adminC, "GET", "/api/admin/config/questions");
  const original = r.json?.config?.teamQuestions?.Electric || [];
  check("#60 admin can read the questions config", r.status === 200 && original.length > 0, err(r));
  const edited = original.map((q, i) => (i === 0 ? { ...q, label: "Skills (edited by backlog-regress)" } : q));
  r = await api(adminC, "PUT", "/api/admin/config/questions", { scope: "team", team: "Electric", questions: edited });
  check("#60 PUT team questions -> 200", r.status === 200, err(r));
  r = await api(adminC, "GET", "/api/questions?team=Electric");
  check("#60 the public questions route serves the edit immediately (server cache invalidated)", r.status === 200 && r.json?.teamQuestions?.[0]?.label === "Skills (edited by backlog-regress)", `${err(r)} ${r.json?.teamQuestions?.[0]?.label}`);
  check("#61 the section write merged: common questions still present alongside", Array.isArray(r.json?.commonQuestions) && r.json.commonQuestions.length > 0, `common=${r.json?.commonQuestions?.length}`);
  const doc = (await db.doc("config/application_questions").get()).data();
  check("#61 the stored document keeps every section (no wholesale replace)", !!doc && Array.isArray(doc.commonQuestions) && doc.commonQuestions.length > 0 && !!doc.teamQuestions?.Electric && !!doc.teamQuestions?.Solar, `sections=${Object.keys(doc || {}).join(",")}`);
  r = await api(adminC, "PUT", "/api/admin/config/questions", { scope: "team", team: "Electric", questions: original });
  r = await api(adminC, "GET", "/api/questions?team=Electric");
  check("#60 restored", r.json?.teamQuestions?.[0]?.label === original[0].label);
  check("#60 public questions route caches for minutes, not hours", /s-maxage=300, stale-while-revalidate=60\b/.test((await fetch(`${BASE}/api/questions?team=Electric`)).headers.get("cache-control") || ""), (await fetch(`${BASE}/api/questions?team=Electric`)).headers.get("cache-control"));
}

// ---- #72: a page render with a staff session still works (one verification, shared by Header and Footer) ----
{
  const res = await fetch(`${BASE}/`, { headers: { cookie: adminC } });
  const html = await res.text();
  check("#72 home renders for staff with the admin logo link", res.status === 200 && html.includes('href="/admin/dashboard"'), `${res.status}`);
  const anon = await fetch(`${BASE}/`);
  check("#72 and anonymously", anon.status === 200 && !(await anon.text()).includes('href="/admin/dashboard"'), `${anon.status}`);
}

await setStep(adminC, "open");
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
