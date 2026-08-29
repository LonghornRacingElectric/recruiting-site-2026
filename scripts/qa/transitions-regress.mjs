// Staff transition table (lib/utils/transitions.ts) end to end: which status
// changes each role may make from which status at which step, on the single
// status route, the reject route, and bulk — plus the offer/decision hygiene
// around them (#104 #105 #106 #107 #108 #109 #110 #116 #117). Emulator only.
//
// Run against the emulator suite with the dev server up (README: local development):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/qa/transitions-regress.mjs
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
const status = (c, id, body) => api(c, "POST", `/api/admin/applications/${id}/status`, body);
const reject = (c, id, systems) => api(c, "POST", `/api/admin/applications/${id}/reject`, { systems });
const bulk = (c, body) => api(c, "POST", "/api/admin/applications/bulk-status", body);
const setStep = (c, step, confirm) => api(c, "POST", "/api/admin/config/recruiting", confirm === undefined ? { step } : { step, confirm });
const S = (a) => `${a.status}/rd=${a.reviewDecision ?? "-"}/id=${a.interviewDecision ?? "-"}/td=${a.trialDecision ?? "-"}/day=${a.trialDecisionDay ?? "-"}/io=${(a.interviewOffers || []).length}/to=${(a.trialOffers || []).length}/ps=${(a.preferredSystems || []).join("+")}`;
const err = (r) => `${r.status} ${r.json?.error || ""}`;

await ensureUser({ uid: "u-cap", email: "cap.e@utexas.edu", name: "Electric Captain", role: "team_captain_ob", memberProfile: { team: "Electric", system: "Electronics" } });
await ensureUser({ uid: "u-body", email: "lead.body@utexas.edu", name: "Body Lead", role: "system_lead", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-rev", email: "rev.body@utexas.edu", name: "Body Reviewer", role: "reviewer", memberProfile: { team: "Electric", system: "Body" } });
await ensureUser({ uid: "u-tr", email: "tr@utexas.edu", name: "Transitioner", role: "applicant" });
const adminC = await session("admin@utexas.edu"), capC = await session("cap.e@utexas.edu"), bodyC = await session("lead.body@utexas.edu"), revC = await session("rev.body@utexas.edu");
const submittedAt = new Date(Date.now() - 48 * 3600e3);
const mk = async (id, st, extra = {}) => { await db.doc(`applications/${id}`).set({ userId: "u-tr", userEmail: "tr@utexas.edu", team: "Electric", preferredSystems: ["Body", "Dynamics"], status: st, formData: { whyJoin: "x" }, createdAt: now(), updatedAt: now(), ...(st !== "in_progress" ? { submittedAt } : {}), ...extra }); };
const off = (system, st = "pending") => ({ system, status: st, createdAt: now() });

// ================= step order (#116) =================
let r = await setStep(adminC, "open", "open"); check("reset -> open (typed)", r.status === 200);
r = await setStep(adminC, "reviewing"); check("#116 forward one step without confirm -> 200", r.status === 200, err(r));
r = await setStep(adminC, "reviewing"); check("#116 re-saving current step without confirm -> 200", r.status === 200, err(r));
r = await setStep(adminC, "release_trial"); check("#116 skipping ahead without confirm -> 400 requiresConfirmation", r.status === 400 && r.json?.requiresConfirmation === true, err(r));
r = await setStep(adminC, "release_trial", "wrong"); check("#116 skipping ahead with wrong confirm -> 400", r.status === 400, err(r));
r = await setStep(adminC, "open"); check("#116 going back without confirm -> 400", r.status === 400, err(r));
r = await setStep(adminC, "open", "open"); check("#116 going back with typed name -> 200", r.status === 200, err(r));

// ================= at OPEN =================
await mk("tr-sub", "submitted"); await mk("tr-sub2", "submitted"); await mk("tr-sub3", "submitted"); await mk("tr-sub4", "submitted");
await mk("tr-com", "committed", { commitment: { accepted: true, committedAt: now() }, offer: { system: "Body", role: "Member", issuedAt: now() }, trialDecision: "advanced" });
await mk("tr-dec", "declined", { commitment: { accepted: false, committedAt: now() } });
await mk("tr-rej", "rejected", { reviewDecision: "rejected", rejectedBySystems: ["Body", "Dynamics"] });

r = await status(adminC, "tr-sub", { status: "interview", systems: ["Body"] }); check("open: submitted -> interview allowed (#118 policy a)", r.status === 200 && (await get("tr-sub")).status === "interview", err(r));
r = await status(adminC, "tr-sub2", { status: "trial", systems: ["Body"] }); check("open: submitted -> trial refused", r.status === 400 && /Can't move|Interviewing/.test(r.json?.error || ""), err(r));
r = await status(adminC, "tr-sub2", { status: "accepted", offer: { system: "Body", role: "Member" } }); check("open: submitted -> accepted refused", r.status === 400 && /Can't move|Trial Workday/.test(r.json?.error || ""), err(r));
r = await status(adminC, "tr-sub2", { status: "waitlisted", offer: { system: "Body" } }); check("open: -> waitlisted refused (step floor)", r.status === 400, err(r));
for (const to of ["in_progress", "committed", "declined"]) {
  r = await status(adminC, "tr-sub2", { status: to }); check(`#106 admin cannot set ${to} via /status`, r.status === 400 && /can't be set/i.test(r.json?.error || ""), err(r));
}
check("tr-sub2 untouched after refusals", (await get("tr-sub2")).status === "submitted", S(await get("tr-sub2")));
r = await status(adminC, "tr-com", { status: "rejected" }); check("#105 committed applicant cannot be rejected", r.status === 400 && /already committed/i.test(r.json?.error || ""), err(r));
r = await status(adminC, "tr-com", { status: "waitlisted", offer: { system: "Body" } }); check("#105 committed applicant cannot be waitlisted", r.status === 400, err(r));
r = await reject(capC, "tr-com", ["Body"]); check("#105 committed applicant cannot be rejected via /reject either", r.status === 400 && /already committed/i.test(r.json?.error || ""), err(r));
check("committed record untouched", (await get("tr-com")).status === "committed" && !!(await get("tr-com")).commitment, S(await get("tr-com")));
r = await status(adminC, "tr-dec", { status: "interview", systems: ["Body"] }); check("#105 declined applicant cannot be re-advanced", r.status === 400 && /already declined/i.test(r.json?.error || ""), err(r));
r = await status(revC, "tr-sub2", { status: "interview", systems: ["Body"] }); check("reviewer refused (403)", r.status === 403, err(r));
r = await status(bodyC, "tr-sub2", { status: "rejected" }); check("#107 lead cannot reject via /status", r.status === 403 && /per system/i.test(r.json?.error || ""), err(r));
check("#107 nothing written by the refused lead reject", (await get("tr-sub2")).status === "submitted" && !(await get("tr-sub2")).rejectedBySystems);
r = await reject(bodyC, "tr-sub2", ["Body"]); check("#107 lead per-system /reject still works", r.status === 200 && (await get("tr-sub2")).rejectedBySystems?.join() === "Body" && (await get("tr-sub2")).status === "submitted", `${err(r)} ${S(await get("tr-sub2"))}`);
r = await status(adminC, "tr-sub3", { status: "rejected" }); check("admin full reject via /status -> rejected", r.status === 200 && (await get("tr-sub3")).status === "rejected", err(r));
r = await status(adminC, "tr-rej", { status: "interview", systems: ["Body"] }); check("rejected -> interview (change of mind) allowed", r.status === 200 && (await get("tr-rej")).status === "interview", err(r));

// #104: unranked system joins the ranking, original preserved
r = await status(capC, "tr-sub4", { status: "interview", systems: ["Electronics"] });
let a = await get("tr-sub4");
check("#104 captain offers an UNRANKED system -> 200", r.status === 200, err(r));
check("#104 offered system appended to preferredSystems; original kept", a.preferredSystems?.join("+") === "Body+Dynamics+Electronics" && a.originalPreferredSystems?.join("+") === "Body+Dynamics", S(a));

// #108: revert to submitted is complete and keeps submittedAt / original ranking
const before = (await get("tr-sub4")).submittedAt.toMillis();
r = await status(bodyC, "tr-sub4", { status: "submitted" }); check("#108 lead cannot revert to submitted (403)", r.status === 403, err(r));
r = await status(capC, "tr-sub4", { status: "submitted" }); a = await get("tr-sub4");
check("#108 captain revert -> submitted, offers cleared, ranking restored", r.status === 200 && a.status === "submitted" && (a.interviewOffers || []).length === 0 && a.preferredSystems?.join("+") === "Body+Dynamics" && a.reviewDecision === "pending", `${err(r)} ${S(a)}`);
check("#108 revert keeps the original submittedAt", a.submittedAt.toMillis() === before, `${a.submittedAt.toMillis()} vs ${before}`);
r = await bulk(adminC, { applicationIds: ["tr-sub"], action: "submitted" }); a = await get("tr-sub");
check("#108 bulk revert -> full reset too", r.status === 200 && a.status === "submitted" && (a.interviewOffers || []).length === 0 && a.submittedAt.toMillis() === submittedAt.getTime(), S(a));

// #110: bulk accept is gone
r = await bulk(adminC, { applicationIds: ["tr-sub"], action: "accept" }); check("#110 bulk accept -> 400 invalid action", r.status === 400, err(r));
r = await bulk(adminC, { applicationIds: ["tr-sub"], action: "waitlist" }); check("bulk waitlist at open -> 400 step floor", r.status === 400, err(r));

// ================= INTERVIEWING =================
r = await setStep(adminC, "interviewing", "interviewing"); check("step -> interviewing", r.status === 200);
await mk("tr-int", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body", "completed")] });
await mk("tr-int2", "interview", { reviewDecision: "advanced", interviewOffers: [off("Body", "completed")], trialDecision: "rejected", trialDecisionDay: 1 });
r = await status(adminC, "tr-int", { status: "trial", systems: ["Body"] }); check("interviewing: interview -> trial allowed", r.status === 200 && (await get("tr-int")).status === "trial", err(r));
r = await status(adminC, "tr-int2", { status: "trial", systems: ["Body"] }); a = await get("tr-int2");
check("#109 trial offer clears an earlier trialDecision/day", r.status === 200 && a.trialDecision === undefined && a.trialDecisionDay === undefined && a.status === "trial", S(a));
r = await status(adminC, "tr-sub", { status: "trial", systems: ["Body"] }); check("interviewing: submitted -> trial refused (from-status)", r.status === 400 && /Can't move/.test(r.json?.error || ""), err(r));
r = await bulk(adminC, { applicationIds: ["tr-sub"], action: "trial" }); check("bulk trial on a submitted app -> per-item refusal", r.status === 200 && r.json?.results?.[0]?.success === false && /Can't move/.test(r.json?.results?.[0]?.error || ""), JSON.stringify(r.json?.results?.[0]));
r = await status(adminC, "tr-int", { status: "waitlisted", offer: { system: "Body" } }); check("interviewing: -> waitlisted refused (step floor)", r.status === 400, err(r));

// ================= TRIAL WORKDAY =================
r = await setStep(adminC, "trial_workday", "trial_workday"); check("step -> trial_workday (typed skip)", r.status === 200);
r = await status(adminC, "tr-int", { status: "waitlisted", offer: { system: "Body" } }); a = await get("tr-int");
check("#117 waitlist persists the chosen system", r.status === 200 && a.status === "waitlisted" && a.waitlistSystem === "Body" && a.trialDecision === "waitlisted", S(a) + ` ws=${a.waitlistSystem}`);
r = await status(adminC, "tr-int", { status: "accepted", offer: { system: "Body", role: "Member" } }); a = await get("tr-int");
check("waitlisted -> accepted with offer", r.status === 200 && a.status === "accepted" && a.offer?.system === "Body", S(a));
r = await status(adminC, "tr-int", { status: "rejected" }); a = await get("tr-int");
check("accepted -> rejected (rescind) withdraws the offer", r.status === 200 && a.status === "rejected" && !a.offer, S(a));
r = await status(bodyC, "tr-int2", { status: "accepted", offer: { system: "Dynamics", role: "Member" } }); check("lead accepting into another system -> 403 (existing fence)", r.status === 403, err(r));
r = await status(bodyC, "tr-int2", { status: "accepted", offer: { system: "Body", role: "Member" } }); check("lead accepting into own system -> 200", r.status === 200 && (await get("tr-int2")).status === "accepted", err(r));

await setStep(adminC, "open", "open");
const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
