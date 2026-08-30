// The sandbox report for the current step: what every applicant would see,
// which systems still owe decisions (and what happens if they never make
// them), what the email run would send, and whether the staff surfaces hold
// up under real volume. Emulator only.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx -y tsx scripts/qa/sandbox/report.mts [--leads a@x,b@y] [--applicants-per-team 3]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { emulatorApp, session, api, ensureSandboxDir, SANDBOX_DIR } from "./common.mjs";
import { getUserVisibleStatus, sanitizeApplicationForApplicant, isAtOrPast } from "@/lib/utils/statusUtils";
import { ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { getEmailTemplatesConfig } from "@/lib/firebase/config";

const { db } = emulatorApp("report");
const arg = (name: string, dflt: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const lines: string[] = [];
const out = (s = "") => { lines.push(s); console.log(s); };
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failures.push(name + (detail ? " — " + detail : "")); out(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");

const step = (await db.doc("config/recruiting").get()).data()?.currentStep as RecruitingStep;
const appsSnap = await db.collection("applications").get();
const apps = appsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const usersSnap = await db.collection("users").get();
const users = new Map(usersSnap.docs.map((d) => [d.id, d.data() as any]));
out(`# Sandbox report — step \`${step}\` — ${new Date().toISOString()}`);
out(`${apps.length} applications, ${users.size} users`);

// ---------------------------------------------------------------- 1. what applicants would see
out(`\n## 1. What applicants would see at \`${step}\``);
const FORBIDDEN = ["reviewDecision", "interviewDecision", "trialDecision", "aggregateRatings", "emailsSent", "rejectedBySystems", "lastEditSession", "trialDecisionDay", "autoRejected", "renegedFrom"];
const visible: Record<string, Record<string, number>> = {};
let leaks = 0, earlyOffers = 0, earlyTrial = 0, earlyFinal = 0, cancelReasons = 0;
for (const app of apps) {
  const v = getUserVisibleStatus(app, step);
  (visible[app.status] ||= {})[v] = ((visible[app.status] ||= {})[v] || 0) + 1;
  const s = sanitizeApplicationForApplicant(app, step) as any;
  for (const k of FORBIDDEN) if (k in s) leaks++;
  if (!isAtOrPast(step, RecruitingStep.RELEASE_INTERVIEWS) && s.interviewOffers) earlyOffers++;
  if (!isAtOrPast(step, RecruitingStep.RELEASE_TRIAL) && s.trialOffers) earlyTrial++;
  if (!isAtOrPast(step, RecruitingStep.RELEASE_DECISIONS_DAY1) && s.offer) earlyFinal++;
  if ((s.interviewOffers || []).some((o: any) => "cancelReason" in o)) cancelReasons++;
}
out("\n| raw status | visible to applicant | count |\n|---|---|---|");
for (const [raw, m] of Object.entries(visible)) for (const [v, n] of Object.entries(m)) out(`| ${raw} | ${v} | ${n} |`);
// Sanity over all records for the sanitizer itself; the true end-to-end leak
// test (a route skipping the sanitizer) is the per-endpoint spot checks in §5.
check("sanitizer strips every internal field across all records (sanity; §5 tests the routes)", leaks === 0, `${leaks} leaks`);
check("no interview offer visible before release_interviews", earlyOffers === 0, `${earlyOffers}`);
check("no trial offer visible before release_trial", earlyTrial === 0, `${earlyTrial}`);
check("no final offer visible before its decision day", earlyFinal === 0, `${earlyFinal}`);
check("no staff cancel reason in any applicant payload", cancelReasons === 0, `${cancelReasons}`);

// ---------------------------------------------------------------- 2. who still owes decisions
out(`\n## 2. Systems that still owe decisions`);
out("Same predicates as the admin dashboard's pending counts (#132): an application still in play (submitted/interview/trial) counts against a ranked system that has neither rejected it nor extended it a LIVE offer — a cancelled offer is no offer. `limbo` = no system has done anything, so the applicant sees nothing but \"Submitted\" and gets no email; `elsewhere` = another system advanced them. `decisions owed` = live interview offers awaiting a trial/reject call, or trial offers awaiting the final decision.");
// The same rules as app/api/admin/dashboard/pending-count (#132), re-stated
// here because that route serves one viewer's numbers, not a full table:
//   live offer = any status but CANCELLED ("a cancelled offer is no offer")
//   in play    = submitted | interview | trial
//   review owed   = in play, and this system neither rejected nor holds a live offer
//   decision owed = this system's live interview offer with no trial offer/rejection
//                   after it; or its trial offer with the final decision unset;
//                   or (at trial stage) it interviewed but never trial-offered
const IN_PLAY = [ApplicationStatus.SUBMITTED, ApplicationStatus.INTERVIEW, ApplicationStatus.TRIAL];
const liveOffers = (list: any[] | undefined, system: string) => (list || []).filter((o: any) => o.system === system && o.status !== InterviewEventStatus.CANCELLED);
type Row = { team: string; system: string; ranked: number; pending: number; limbo: number; elsewhere: number; decisions: number };
const rows: Row[] = [];
const limboApps: any[] = [];
for (const [team, systems] of Object.entries(TEAM_SYSTEMS as Record<string, { value: string }[]>)) {
  for (const { value: system } of systems) {
    const ranked = apps.filter((a) => a.team === team && (a.preferredSystems || []).includes(system) && a.status !== ApplicationStatus.IN_PROGRESS);
    let pending = 0, limbo = 0, elsewhere = 0, decisions = 0;
    for (const a of ranked) {
      const rejected = (a.rejectedBySystems || []).includes(system);
      const myInterview = liveOffers(a.interviewOffers, system);
      const myTrial = liveOffers(a.trialOffers, system);
      const decided = rejected || myInterview.length > 0 || myTrial.length > 0 || a.offer?.system === system || a.waitlistSystem === system;
      if (IN_PLAY.includes(a.status) && !decided) {
        pending++;
        const anyLiveOffer = (a.interviewOffers || []).concat(a.trialOffers || []).some((o: any) => o.status !== InterviewEventStatus.CANCELLED) || !!a.offer;
        if (anyLiveOffer) elsewhere++; else if (a.status === ApplicationStatus.SUBMITTED) { limbo++; limboApps.push(a); }
      }
      if (!rejected && IN_PLAY.includes(a.status)) {
        const trialDecisionMade = a.status !== ApplicationStatus.TRIAL ? true : !!(a.trialDecision || a.offer || a.waitlistSystem);
        if (myTrial.length > 0 && a.status === ApplicationStatus.TRIAL && !a.trialDecision && !(a.offer?.system === system) && a.waitlistSystem !== system) decisions++;
        else if (myTrial.length === 0 && myInterview.length > 0 && (a.status === ApplicationStatus.INTERVIEW || a.status === ApplicationStatus.TRIAL) && !trialDecisionMade) decisions++;
        else if (myTrial.length === 0 && myInterview.length > 0 && a.status === ApplicationStatus.INTERVIEW) decisions++;
      }
    }
    rows.push({ team, system, ranked: ranked.length, pending, limbo, elsewhere, decisions });
  }
}
out("\n| team | system | ranked | reviews owed | of which: nothing anywhere (limbo) | of which: advanced elsewhere | decisions owed | done? |\n|---|---|---|---|---|---|---|---|");
for (const r of rows.sort((a, b) => (b.pending + b.decisions) - (a.pending + a.decisions))) out(`| ${r.team} | ${r.system} | ${r.ranked} | ${r.pending} | ${r.limbo} | ${r.elsewhere} | ${r.decisions} | ${r.pending + r.decisions === 0 ? "✅" : ""} |`);
const limboIds = new Set(limboApps.map((a) => a.id));
const limboByTeam: Record<string, number> = {};
for (const id of limboIds) { const a = apps.find((x) => x.id === id)!; limboByTeam[a.team] = (limboByTeam[a.team] || 0) + 1; }
out(`\n**If nothing more is decided before the flip:** ${limboIds.size} submitted applicants (${Object.entries(limboByTeam).map(([t, n]) => `${t} ${n}`).join(", ")}) would stay at "Submitted" on their dashboard with no email at \`release_interviews\`, and would keep that status through every later step unless a system acts. They are not auto-rejected by any sweep.`);
const unranked = apps.filter((a) => a.status === ApplicationStatus.SUBMITTED && (a.preferredSystems || []).length === 0);
if (unranked.length) out(`
**${unranked.length} submitted application(s) rank no system at all** (${unranked.map((a) => `${a.team} ${a.id}`).join(", ")}): no lead can see or act on them, so they stay "Submitted" indefinitely unless a captain/admin handles them.`);
const fullyRejectedNoEmail = apps.filter((a) => a.status === ApplicationStatus.REJECTED);
out(`${fullyRejectedNoEmail.length} applications are fully rejected and would receive the rejection email at the flip (visible status becomes Rejected).`);

// ---------------------------------------------------------------- 3. email dry run
out(`\n## 3. Email run at \`${step}\` (dry — templates globally disabled in the sandbox, no SES credentials locally)`);
const triggerMap: Partial<Record<string, string>> = { interview: "interview_offered", trial: "trial_offered", accepted: "accepted", rejected: "rejected", waitlisted: "waitlisted" };
const templatesDoc = await getEmailTemplatesConfig(); // the app's loader — handles the legacy doc shape too
if (templatesDoc.globalEnabled !== false) {
  out("\nABORT: email templates are NOT globally disabled in this sandbox — refusing to touch the email route. Re-run import.mjs.");
  check("email templates are globally disabled in the sandbox", false);
  ensureSandboxDir(); writeFileSync(path.join(SANDBOX_DIR, `report-${step}.md`), lines.join("\n") + "\n");
  process.exit(1);
}
check("email templates are globally disabled in the sandbox", true);
const isFake = (a: any) => a.isFakeData === true || (a.userEmail || "").includes(".fake");
const wouldSend: Record<string, number> = {}, alreadySent: Record<string, number> = {}, noTemplate: Record<string, number> = {};
let fakeSkipped = 0;
for (const a of apps) {
  const trig = triggerMap[getUserVisibleStatus(a, step)];
  if (!trig) continue;
  if (isFake(a)) { fakeSkipped++; continue; } // sendStatusEmail's first check
  const key = `${a.team} / ${trig}`;
  if ((a.emailsSent || []).includes(trig)) { alreadySent[key] = (alreadySent[key] || 0) + 1; continue; }
  const t = (templatesDoc?.teams?.[a.team] || []).find((x: any) => x.trigger === trig);
  if (!t || !t.enabled) { noTemplate[key] = (noTemplate[key] || 0) + 1; continue; }
  wouldSend[key] = (wouldSend[key] || 0) + 1;
}
out("\n| team / template | would send | already sent (skipped) | no/disabled template |\n|---|---|---|---|");
for (const k of new Set([...Object.keys(wouldSend), ...Object.keys(alreadySent), ...Object.keys(noTemplate)].sort())) out(`| ${k} | ${wouldSend[k] || 0} | ${alreadySent[k] || 0} | ${noTemplate[k] || 0} |`);
const totalWould = Object.values(wouldSend).reduce((a, b) => a + b, 0);
out(`\nTotal that would go out: **${totalWould}**${fakeSkipped ? ` (plus ${fakeSkipped} fake-data application(s) the sender skips)` : ""}`);
const adminEmail = [...users.values()].find((u) => u.role === "admin" && u.email)?.email;
if (!adminEmail) { out("ABORT: no admin account in the snapshot"); ensureSandboxDir(); writeFileSync(path.join(SANDBOX_DIR, `report-${step}.md`), lines.join("\n") + "\n"); process.exit(1); }
const adminC = await session(adminEmail);
const batch = apps.slice(0, 100);
const batchEligible = batch.filter((a) => { if (isFake(a)) return false; const t = triggerMap[getUserVisibleStatus(a, step)]; return t && !(a.emailsSent || []).includes(t) && (templatesDoc.teams[a.team] || []).some((x: any) => x.trigger === t); }).length;
const dry = await api(adminC, "POST", "/api/admin/config/recruiting/trigger-emails", { applicationIds: batch.map((a) => a.id) });
check("the real email route sends nothing (first 100 applications): sent=0", dry.status === 200 && dry.json?.sentCount === 0, `HTTP ${dry.status} sent=${dry.json?.sentCount} skipped=${dry.json?.skippedCount} reasons=${JSON.stringify(dry.json?.skipReasons)}`);
check(`the kill switch is what stopped them: globally_disabled reported for all ${batchEligible} eligible in that batch`, (dry.json?.skipReasons?.globally_disabled || 0) === batchEligible, `reported=${dry.json?.skipReasons?.globally_disabled || 0} eligible=${batchEligible}`);

// ---------------------------------------------------------------- 4. staff surfaces under real volume
out(`\n## 4. Staff surfaces under real volume`);
const leadsArg = arg("--leads", "");
const leadEmails = leadsArg ? leadsArg.split(",") : [...users.values()].filter((u) => u.role === "system_lead" && u.memberProfile?.team).reduce((acc: any[], u) => { if (!acc.some((x) => x.memberProfile.team === u.memberProfile.team)) acc.push(u); return acc; }, []).map((u) => u.email);
const captain = [...users.values()].find((u) => u.role === "team_captain_ob" && u.email);
const personas = [adminEmail, captain?.email, ...leadEmails].filter(Boolean) as string[];
out("\n| who | role | list (count, ms) | dashboard pending | activity feed | notes |\n|---|---|---|---|---|---|");
for (const email of personas) {
  const u = [...users.values()].find((x) => x.email === email);
  let c: string; try { c = await session(email); } catch (e: any) { out(`| ${email} | ${u?.role} | sign-in failed: ${e.message} | | | |`); continue; }
  const list = await api(c, "GET", "/api/admin/applications?all=true");
  const pend = await api(c, "GET", "/api/admin/dashboard/pending-count");
  const act = await api(c, "GET", "/api/admin/audit?limit=50");
  const notes: string[] = [];
  if (list.status !== 200) notes.push(`list ${list.status} ${list.json?.error || ""}`);
  if (pend.status !== 200) notes.push(`pending ${pend.status} ${pend.json?.error || ""}`);
  const leadNoFeed = u?.role === "system_lead" || u?.role === "reviewer";
  if (leadNoFeed ? act.status !== 403 : act.status !== 200) notes.push(`activity ${act.status} ${act.json?.error || ""}`);
  const pendSummary = pend.json ? JSON.stringify(pend.json).slice(0, 80) : "-";
  out(`| ${u?.name || email} | ${u?.role} ${u?.memberProfile?.team || ""}/${u?.memberProfile?.system || ""} | ${list.json?.applications?.length ?? "-"}, ${list.ms}ms | ${pendSummary} | ${act.status === 403 ? "no access (by design)" : `${act.json?.entries?.length ?? "-"} entries, ${act.ms}ms`} | ${notes.join("; ")} |`);
  check(`${u?.name || email}: list/dashboard/activity all 200`, notes.length === 0, notes.join("; "));
}
const csv = await api(adminC, "POST", "/api/admin/applications/export-csv", { teams: ["Electric", "Solar", "Combustion"] });
const csvRows = (csv.text || "").split(/\r?\n/).filter(Boolean).length - 1;
check("admin CSV export of everything", csv.status === 200 && csvRows > 0, `HTTP ${csv.status}, ${csvRows} rows, ${csv.ms}ms`);
const stats = await api("", "GET", "/api/stats", undefined, { Authorization: `Bearer ${process.env.STATS_API_TOKEN || "sandbox-stats-token"}` });
check("stats endpoint (bot token)", stats.status === 200, `HTTP ${stats.status} ${stats.ms}ms`);
const adminStats = await api(adminC, "GET", "/api/admin/stats");
check("admin stats page data", adminStats.status === 200, `HTTP ${adminStats.status} ${adminStats.ms}ms`);

// ---------------------------------------------------------------- 5. applicant spot checks (real accounts, sandbox only)
out(`\n## 5. Applicant spot checks`);
const perTeam = Number(arg("--applicants-per-team", "5")); // how many of the 5 cases to spot-check per team
const pick = (pred: (a: any) => boolean) => apps.filter(pred);
out("\n| team | case | application | visible status | offers shown | interview page | notes |\n|---|---|---|---|---|---|---|");
for (const team of ["Electric", "Solar", "Combustion"]) {
  const cases: [string, any[]][] = [
    ["single interview offer", pick((a) => a.team === team && a.status === "interview" && (a.interviewOffers || []).length === 1)],
    ["multiple offers (must pick)", pick((a) => a.team === team && a.status === "interview" && (a.interviewOffers || []).length > 1 && !a.selectedInterviewSystem)],
    ["fully rejected", pick((a) => a.team === team && a.status === "rejected")],
    ["submitted, no decision (limbo)", pick((a) => a.team === team && limboIds.has(a.id))],
    ["draft", pick((a) => a.team === team && a.status === "in_progress")],
  ];
  for (const [label, pool] of cases.slice(0, Math.max(1, perTeam))) {
    const a = pool[0];
    if (!a) { out(`| ${team} | ${label} | (none) | | | | |`); continue; }
    const email = users.get(a.userId)?.email || a.userEmail;
    let c: string; try { c = await session(email); } catch (e: any) { out(`| ${team} | ${label} | ${a.id} | sign-in failed | | | ${e.message} |`); continue; }
    const one = await api(c, "GET", `/api/applications/${a.id}`);
    const iv = await api(c, "GET", `/api/applications/${a.id}/interview`);
    const payload = one.json?.application || {};
    const leak = FORBIDDEN.filter((k) => k in payload);
    const offers = (payload.interviewOffers || []).map((o: any) => `${o.system}:${o.status}`).join(", ") || "-";
    const released = isAtOrPast(step, RecruitingStep.RELEASE_INTERVIEWS);
    const ivSummary = !released ? (iv.status === 200 ? "served before release!" : `not released (HTTP ${iv.status})`) : iv.status === 200 ? `${(iv.json?.offers || []).length} offers${iv.json?.needsSystemSelection ? ", must pick" : ""}${(iv.json?.offers || []).some((o: any) => o.signupLink) ? ", link ok" : (iv.json?.offers || []).some((o: any) => o.configMissing) ? ", CONFIG MISSING" : ""}` : `HTTP ${iv.status}`;
    out(`| ${team} | ${label} | ${a.id} | ${payload.status} | ${offers} | ${ivSummary} | ${leak.length ? "LEAK " + leak.join(",") : ""} |`);
    check(`${team} ${label}: applicant GET 200, no leak, interview page ${released ? "served" : "withheld"}`, one.status === 200 && leak.length === 0 && (released ? iv.status === 200 || (payload.status !== "interview") : iv.status !== 200), `HTTP ${one.status}/${iv.status} ${leak.join(",")}`);
  }
}

// ---------------------------------------------------------------- 6. interview signup links
out(`
## 6. Interview signup links (what offer-holders will be sent to)`);
const cfgSnap = await db.collection("interviewConfigs").get();
const cfgByKey = new Map(cfgSnap.docs.map((d) => [`${d.data().team}|${d.data().system}`, d.data() as any]));
out(String.fromCharCode(10) + "| team | system | offers held by applicants | signup link |" + String.fromCharCode(10) + "|---|---|---|---|");
let missingLinkOffers = 0; const missingSystems: string[] = [];
for (const [team, systems] of Object.entries(TEAM_SYSTEMS as Record<string, { value: string }[]>)) {
  for (const { value: system } of systems) {
    const offers = apps.filter((a) => a.team === team && a.status === ApplicationStatus.INTERVIEW && (a.interviewOffers || []).some((o: any) => o.system === system && o.status !== InterviewEventStatus.CANCELLED)).length;
    const cfg = cfgByKey.get(`${team}|${system}`);
    const link = cfg?.signupLink ? "✅ set" : cfg ? "❌ EMPTY" : "❌ NO CONFIG DOC";
    if (offers > 0 && !cfg?.signupLink) { missingLinkOffers += offers; missingSystems.push(`${team}/${system} (${offers})`); }
    if (offers > 0 || !cfg?.signupLink) out(`| ${team} | ${system} | ${offers} | ${link} |`);
  }
}
check("every system with live interview offers has a signup link configured", missingLinkOffers === 0, missingSystems.length ? `${missingLinkOffers} offer-holders would see "signup link not configured yet": ${missingSystems.join(", ")}` : "");

// ---------------------------------------------------------------- summary
out(`\n## Summary`);
out(failures.length === 0 ? "All checks passed." : `**${failures.length} check(s) failed:**\n` + failures.map((f) => `- ${f}`).join("\n"));
ensureSandboxDir();
const file = path.join(SANDBOX_DIR, `report-${step}.md`);
writeFileSync(file, lines.join("\n") + "\n");
console.log(`\nreport written to ${file}`);
process.exit(failures.length === 0 ? 0 : 1);
