// Per-system display status for leads/reviewers (getStaffDisplayStatus):
// the badge answers "what has MY system done with this applicant", with a hint
// when another system has taken them further. Pure function — no emulator.
//
//   npx -y tsx scripts/qa/staff-status-regress.ts
import { getStaffDisplayStatus, formatElsewhere } from "@/lib/utils/staffDisplayStatus";
import { ApplicationStatus as S, InterviewEventStatus as E } from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };
const off = (system: string, status: E = E.PENDING) => ({ system, status, createdAt: new Date() });
const show = (d: ReturnType<typeof getStaffDisplayStatus>) => `${d.status}${d.elsewhere ? " [" + formatElsewhere(d.elsewhere) + "]" : ""}`;

const powertrain = { role: UserRole.REVIEWER, memberProfile: { team: "Electric", system: "Powertrain" } };
const dynamics = { role: UserRole.SYSTEM_LEAD, memberProfile: { team: "Electric", system: "Dynamics" } };
const captain = { role: UserRole.TEAM_CAPTAIN_OB, memberProfile: { team: "Electric", system: "Electronics" } };
const admin = { role: UserRole.ADMIN };
const leadNoProfile = { role: UserRole.SYSTEM_LEAD };

// ---- the report: Dynamics advanced; Powertrain never opened it ----
let app: Parameters<typeof getStaffDisplayStatus>[0] = { status: S.INTERVIEW, interviewOffers: [off("Dynamics")] };
let d = getStaffDisplayStatus(app, powertrain);
check("report: Powertrain sees Submitted, not Interview", d.status === S.SUBMITTED, show(d));
check("report: with the hint 'Interview · Dynamics'", !!d.elsewhere && formatElsewhere(d.elsewhere) === "Interview · Dynamics", show(d));
d = getStaffDisplayStatus(app, dynamics);
check("Dynamics (the system that acted) sees Interview, no hint", d.status === S.INTERVIEW && !d.elsewhere, show(d));
d = getStaffDisplayStatus(app, captain);
check("captain keeps the global view: Interview, no hint", d.status === S.INTERVIEW && !d.elsewhere, show(d));
d = getStaffDisplayStatus(app, admin);
check("admin keeps the global view: Interview, no hint", d.status === S.INTERVIEW && !d.elsewhere, show(d));
d = getStaffDisplayStatus(app, leadNoProfile);
check("a lead with no system profile falls back to the global view", d.status === S.INTERVIEW && !d.elsewhere, show(d));
d = getStaffDisplayStatus(app, null);
check("no viewer -> global view", d.status === S.INTERVIEW && !d.elsewhere, show(d));

// ---- both systems offered ----
app = { status: S.INTERVIEW, interviewOffers: [off("Dynamics"), off("Powertrain")] };
d = getStaffDisplayStatus(app, powertrain);
check("both offered: Powertrain sees Interview, no hint (same stage)", d.status === S.INTERVIEW && !d.elsewhere, show(d));

// ---- trial elsewhere ----
app = { status: S.TRIAL, interviewOffers: [off("Dynamics", E.COMPLETED)], trialOffers: [off("Dynamics")] };
d = getStaffDisplayStatus(app, powertrain);
check("Dynamics at trial, Powertrain never acted: Submitted + 'Trial · Dynamics'", d.status === S.SUBMITTED && !!d.elsewhere && formatElsewhere(d.elsewhere) === "Trial · Dynamics", show(d));
d = getStaffDisplayStatus(app, dynamics);
check("Dynamics sees Trial", d.status === S.TRIAL && !d.elsewhere, show(d));
app = { status: S.TRIAL, interviewOffers: [off("Dynamics", E.COMPLETED), off("Powertrain", E.COMPLETED)], trialOffers: [off("Dynamics")] };
d = getStaffDisplayStatus(app, powertrain);
check("Powertrain interviewed, Dynamics went to trial: Interview + 'Trial · Dynamics'", d.status === S.INTERVIEW && !!d.elsewhere && formatElsewhere(d.elsewhere) === "Trial · Dynamics", show(d));
app = { status: S.TRIAL, interviewOffers: [off("Dynamics", E.COMPLETED), off("Powertrain", E.COMPLETED)], trialOffers: [off("Powertrain")] };
d = getStaffDisplayStatus(app, powertrain);
check("Powertrain at trial, Dynamics only interviewed: Trial, no hint (nobody is ahead of us)", d.status === S.TRIAL && !d.elsewhere, show(d));

// ---- our rejection while the application is alive elsewhere (#102 behaviour kept) ----
app = { status: S.INTERVIEW, rejectedBySystems: ["Powertrain"], interviewOffers: [off("Dynamics")] };
d = getStaffDisplayStatus(app, powertrain);
check("we rejected, Dynamics interviewing: Rejected + 'Interview · Dynamics'", d.status === S.REJECTED && !!d.elsewhere && formatElsewhere(d.elsewhere) === "Interview · Dynamics", show(d));
d = getStaffDisplayStatus(app, dynamics);
check("Dynamics unaffected by Powertrain's rejection", d.status === S.INTERVIEW && !d.elsewhere, show(d));
app = { status: S.SUBMITTED, rejectedBySystems: ["Powertrain"] };
d = getStaffDisplayStatus(app, powertrain);
check("we rejected, nobody else acted: Rejected, no hint", d.status === S.REJECTED && !d.elsewhere, show(d));
app = { status: S.INTERVIEW, rejectedBySystems: ["Powertrain"], interviewOffers: [off("Powertrain", E.COMPLETED), off("Dynamics")] };
d = getStaffDisplayStatus(app, powertrain);
check("rejected after our own interview: rejection wins", d.status === S.REJECTED, show(d));

// ---- cancelled offers are not offers ----
app = { status: S.SUBMITTED, interviewOffers: [off("Dynamics", E.CANCELLED)] };
d = getStaffDisplayStatus(app, powertrain);
check("a cancelled Dynamics offer produces no hint", d.status === S.SUBMITTED && !d.elsewhere, show(d));
d = getStaffDisplayStatus(app, dynamics);
check("a cancelled offer of our own: Submitted", d.status === S.SUBMITTED && !d.elsewhere, show(d));
app = { status: S.INTERVIEW, interviewOffers: [off("Dynamics", E.NO_SHOW)] };
d = getStaffDisplayStatus(app, dynamics);
check("a no-show offer still places the applicant at Interview for us", d.status === S.INTERVIEW, show(d));

// ---- global end states pass through for everyone ----
app = { status: S.REJECTED, rejectedBySystems: ["Dynamics", "Powertrain"] };
check("fully rejected: Rejected for Powertrain", getStaffDisplayStatus(app, powertrain).status === S.REJECTED);
app = { status: S.REJECTED, rejectedBySystems: [], interviewOffers: [off("Dynamics")] };
d = getStaffDisplayStatus(app, powertrain);
check("admin/sweep rejection with a stale offer: Rejected (dead applicant), no hint", d.status === S.REJECTED && !d.elsewhere, show(d));
for (const st of [S.ACCEPTED, S.WAITLISTED, S.COMMITTED, S.DECLINED, S.IN_PROGRESS]) {
  app = { status: st, trialOffers: [off("Dynamics")], interviewOffers: [off("Dynamics", E.COMPLETED)] };
  d = getStaffDisplayStatus(app, powertrain);
  check(`${st}: shown as-is to Powertrain, no hint`, d.status === st && !d.elsewhere, show(d));
}

// ---- hint formatting ----
app = { status: S.INTERVIEW, interviewOffers: [off("Dynamics"), off("Body"), off("Dynamics", E.NO_SHOW), off("Powertrain", E.CANCELLED)] };
d = getStaffDisplayStatus(app, powertrain);
check("hint lists other systems once each, in offer order, never ours", !!d.elsewhere && formatElsewhere(d.elsewhere) === "Interview · Dynamics, Body" && d.status === S.SUBMITTED, show(d));
app = { status: S.TRIAL, interviewOffers: [off("Dynamics", E.COMPLETED), off("Body", E.COMPLETED)], trialOffers: [off("Body")] };
d = getStaffDisplayStatus(app, powertrain);
check("hint shows the furthest stage only", !!d.elsewhere && formatElsewhere(d.elsewhere) === "Trial · Body", show(d));

const fails = results.filter((x) => !x).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
