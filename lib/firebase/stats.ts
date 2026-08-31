import { adminDb } from "./admin";
import { getRecruitingConfig } from "./config";
import { slugifySystem } from "./utils";
import { Team, UserRole } from "@/lib/models/User";
import { Application, ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { EmailTrigger, STATUS_EMAIL_TRIGGERS } from "@/lib/models/EmailTemplate";
import { getUserVisibleStatus, clampDecisionDay, STEP_ORDER } from "@/lib/utils/statusUtils";
import { systemPending } from "@/lib/utils/systemPending";
import { closeInterviewsWouldReject } from "@/lib/utils/interviewSweep";

/**
 * Aggregate recruiting statistics.
 *
 * Everything here is a count. No document in the response carries a name, an
 * email, a uid, or free text — the stats page is meant to be safe to
 * screenshot into Slack, and /api/stats hands a further-reduced subset to the
 * recruiting bot. Keep it that way: add numbers, never records. (Two
 * deliberate exceptions: system/team names in `interviews.signupLinks` —
 * staff configuration, not applicants — and the staff uid in a snapshot's
 * `capturedBy`, the admin who saved the transition, which the audit log
 * records anyway.)
 *
 * History is derived from timestamps already on the data (createdAt,
 * submittedAt, user createdAt) rather than stored snapshots, so there is no
 * cron to keep alive. One consequence: an application that is submitted and
 * later reopened drops out of the "submitted" history entirely.
 *
 * The exception to "no stored snapshots": each FORWARD recruiting-step
 * transition freezes the numbers as they stood at that moment into
 * `stats_snapshots/{stepBeingLeft}` (captureStatsSnapshot, called by the
 * step-change route before the step is written and before any sweep runs).
 * That is what lets /admin/stats show what the world looked like at the end
 * of a past step after sweeps and releases have moved everyone on.
 *
 * The phase sections (review / interviews / decisions / emails) reuse the
 * exact predicates the operational code runs — systemPending from the
 * dashboard, closeInterviewsWouldReject from the CLOSE_INTERVIEWS sweep,
 * STATUS_EMAIL_TRIGGERS + getUserVisibleStatus from the email job — so the
 * numbers here can never drift from what those features will actually do.
 */

export const STATS_BUCKET_MINUTES = 15;
const STATS_TTL_MS = 5 * 60 * 1000;
const SERIES_MAX_DAYS = 90;
const DEMOGRAPHIC_TOP_N = 15;
const SNAPSHOT_COLLECTION = "stats_snapshots";
// Bump when a phase-section shape changes incompatibly: snapshots are durable
// docs, and getStatsSnapshots drops mismatched ones (the UI then falls back
// to live numbers) instead of letting an old shape crash the panels.
const SNAPSHOT_SCHEMA_VERSION = 1;

export const STATS_TEAMS: Team[] = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];
const STATUSES = Object.values(ApplicationStatus) as ApplicationStatus[];
const EMAIL_TRIGGERS: EmailTrigger[] = ["interview_offered", "trial_offered", "accepted", "rejected", "waitlisted"];

export type TeamCounts = Record<Team, number>;
export type StatusCounts = Record<ApplicationStatus, number>;

/** A count with its per-team split — the shape most phase numbers share. */
export interface Tally { total: number; byTeam: TeamCounts }

export interface OfferStatusCounts { pending: number; completed: number; cancelled: number; noShow: number; total: number }

const zeroTeams = (): TeamCounts => ({ [Team.ELECTRIC]: 0, [Team.SOLAR]: 0, [Team.COMBUSTION]: 0 });
const zeroStatuses = (): StatusCounts =>
  Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;
const zeroTally = (): Tally => ({ total: 0, byTeam: zeroTeams() });
const zeroOffers = (): OfferStatusCounts => ({ pending: 0, completed: 0, cancelled: 0, noShow: 0, total: 0 });
const bump = (t: Tally, team: Team) => { t.total++; t.byTeam[team]++; };

export interface StatsSeriesPoint {
  /** Bucket start, ISO. Buckets with nothing in them are omitted. */
  t: string;
  created: TeamCounts;
  submitted: TeamCounts;
  accounts: number;
}

export interface SystemDemand {
  system: string;
  /** Applications ranking this system anywhere. */
  any: number;
  rank1: number;
  rank2: number;
  rank3: number;
  /** Submitted applications ranking it anywhere. */
  submitted: number;
  rejectedBy: number;
  interviewOffers: number;
  trialOffers: number;
  /** Interview offers from this system by outcome. */
  intPending: number;
  intCompleted: number;
  intCancelled: number;
  intNoShow: number;
  /** Applicants whose one-way interview pick landed on this system. */
  picked: number;
}

export interface RecruitingStats {
  generatedAt: string;
  step: RecruitingStep;
  accounts: { applicants: number; staff: number; applicantsWithCreatedAt: number };
  applications: {
    total: number;
    /** Ever submitted (anything past in_progress) — does not shrink as applicants advance. */
    submitted: number;
    byStatus: StatusCounts;
    byTeam: Record<Team, { total: number; submitted: number; byStatus: StatusCounts }>;
  };
  velocity: {
    createdLastHour: number;
    createdLast24h: number;
    submittedLastHour: number;
    submittedLast24h: number;
    accountsLastHour: number;
    accountsLast24h: number;
  };
  systems: Record<Team, SystemDemand[]>;
  crossTeam: {
    /** Distinct applicants with at least one application. */
    applicants: number;
    byTeamCount: { 1: number; 2: number; 3: number };
    /** Of the single-team applicants, which team they picked. */
    singleTeam: TeamCounts;
    combos: { teams: Team[]; count: number }[];
  };
  uploads: { submitted: number; resume: number; portfolio: number };
  demographics: {
    major: { value: string; count: number }[];
    graduationYear: { value: string; count: number }[];
  };
  /** Review phase, dashboard-verbatim (same systemPending predicate as the pending-count route). */
  review: {
    /** Submitted applications with no review decision — the admin lens. */
    pendingReview: Tally;
    /** Submitted-with-no-ranking: invisible to every lead's array-contains query (#131). */
    unranked: Tally;
    /** Per ranked (application, system) pair still waiting on that system. */
    bySystem: Record<Team, { system: string; review: number; decision: number }[]>;
  };
  /** Interview phase. Applicant tallies are scoped to real status = interview. */
  interviews: {
    offers: OfferStatusCounts;
    offersByTeam: Record<Team, OfferStatusCounts>;
    atInterview: Tally;
    /** Made their one-way system pick. */
    picked: Tally;
    /** Multiple live (pending) offers and no pick — who the close sweep is watching. */
    awaitingPick: Tally;
    /** Exactly one live offer — never sees the picker; staff mark these completed/no-show by hand. */
    singleLive: Tally;
    /** What the CLOSE_INTERVIEWS sweep would reject if it ran right now (same predicate as the sweep). */
    sweepPreview: Tally;
    /** Signup-link coverage for systems holding at least one live offer. */
    signupLinks: { needed: number; withLink: number; missing: { team: Team; system: string }[] };
  };
  /** Trial + decision-day phase. */
  decisions: {
    /** Trial workday offers extended (offer count, not applicant count). */
    trialOffers: Tally;
    trialDecisions: Record<"advanced" | "rejected" | "waitlisted", Tally>;
    /** Final-offer outcomes by release day (advanced decisions, plus offers that expired unanswered). */
    byDay: Record<"1" | "2" | "3", { decided: number; committed: number; declined: number; awaiting: number; expired: number }>;
    committed: Tally;
    declined: Tally;
    /** Status ACCEPTED with no commitment response yet. */
    awaitingResponse: Tally;
    waitlisted: Tally;
    autoRejected: { offerExpired: number; committedElsewhere: number };
    /** Commits that replaced a prior acceptance (waitlist-promotion reneg). */
    reneged: number;
  };
  /** Email coverage per (trigger, team): owed at the current step vs recorded as sent — same trigger derivation as the send job. */
  emails: { rows: { trigger: EmailTrigger; team: Team; eligible: number; sent: number }[] };
  series: { bucketMinutes: number; from: string; to: string; points: StatsSeriesPoint[] };
}

/**
 * A frozen copy of the stats (minus the reconstructible time series) taken at
 * the moment a forward step transition was saved — before the step was
 * written and before any sweep ran, so it shows the world as the outgoing
 * step left it. Doc id = the step being left.
 */
export interface StatsSnapshot extends Omit<RecruitingStats, "series"> {
  schemaVersion: number;
  snapshotStep: RecruitingStep;
  nextStep: RecruitingStep;
  capturedAt: string;
  /** Staff uid that saved the transition (staff-facing payload only). */
  capturedBy: string;
}

/** The subset handed to the recruiting bot. Numbers only, no free text. */
export interface PublicRecruitingStats {
  generatedAt: string;
  step: RecruitingStep;
  applicantAccounts: number;
  applications: {
    total: number;
    /** Ever submitted — the "how many applications have been submitted" number. */
    submitted: number;
    byStatus: StatusCounts;
    byTeam: Record<Team, { total: number; submitted: number; inProgress: number }>;
  };
  velocity: RecruitingStats["velocity"];
  systems: Record<Team, { system: string; any: number; rank1: number; submitted: number }[]>;
  crossTeam: RecruitingStats["crossTeam"]["byTeamCount"];
  interviews: { atInterview: number; offersPending: number; offersCompleted: number; picked: number; awaitingPick: number };
  decisions: { committed: number; declined: number; awaitingResponse: number; waitlisted: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toMs = (t: any): number | null => {
  if (!t) return null;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t instanceof Date) return t.getTime();
  if (typeof t._seconds === "number") return t._seconds * 1000;
  return null;
};

const isTeam = (t: unknown): t is Team => STATS_TEAMS.includes(t as Team);

const normalizeText = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

/**
 * Free-text tally that folds case ("ECE" / "ece" / "Ece" are one row) and
 * displays whichever spelling was used most.
 */
class TextTally {
  private buckets = new Map<string, { count: number; spellings: Map<string, number> }>();
  add(raw: unknown) {
    const s = normalizeText(raw);
    if (!s) return;
    const key = s.toLowerCase();
    let b = this.buckets.get(key);
    if (!b) { b = { count: 0, spellings: new Map() }; this.buckets.set(key, b); }
    b.count++;
    b.spellings.set(s, (b.spellings.get(s) || 0) + 1);
  }
  top(n: number): { value: string; count: number }[] {
    const rows = [...this.buckets.values()].map((b) => ({
      value: [...b.spellings.entries()].sort((a, c) => c[1] - a[1])[0][0],
      count: b.count,
    }));
    rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    const head = rows.slice(0, n);
    const rest = rows.slice(n).reduce((acc, r) => acc + r.count, 0);
    if (rest > 0) head.push({ value: "Other", count: rest });
    return head;
  }
}

export async function computeRecruitingStats(): Promise<RecruitingStats> {
  const now = Date.now();
  const [config, appsSnap, usersSnap, interviewConfigsSnap] = await Promise.all([
    getRecruitingConfig(),
    adminDb
      .collection("applications")
      .select(
        "team", "status", "preferredSystems", "createdAt", "submittedAt", "isFakeData", "userId",
        "rejectedBySystems", "interviewOffers", "trialOffers",
        "reviewDecision", "interviewDecision", "trialDecision", "trialDecisionDay",
        "selectedInterviewSystem", "emailsSent", "commitment", "autoRejected", "renegedFrom",
        "formData.major", "formData.graduationYear", "formData.resumeUrl", "formData.portfolioUrl"
      )
      .get(),
    adminDb.collection("users").select("role", "createdAt").get(),
    adminDb.collection("interviewConfigs").select("team", "system", "signupLink").get(),
  ]);

  // ---- accounts ----
  let applicants = 0, staff = 0, applicantsWithCreatedAt = 0;
  const accountTimes: number[] = [];
  for (const d of usersSnap.docs) {
    const u = d.data();
    if (u.role === UserRole.APPLICANT) {
      applicants++;
      const ms = toMs(u.createdAt);
      if (ms !== null) { applicantsWithCreatedAt++; accountTimes.push(ms); }
    } else {
      staff++;
    }
  }

  // ---- applications ----
  const byStatus = zeroStatuses();
  const byTeam = Object.fromEntries(
    STATS_TEAMS.map((t) => [t, { total: 0, submitted: 0, byStatus: zeroStatuses() }])
  ) as RecruitingStats["applications"]["byTeam"];
  let submittedEver = 0;
  const zeroDemand = (system: string): SystemDemand =>
    ({ system, any: 0, rank1: 0, rank2: 0, rank3: 0, submitted: 0, rejectedBy: 0, interviewOffers: 0, trialOffers: 0, intPending: 0, intCompleted: 0, intCancelled: 0, intNoShow: 0, picked: 0 });
  const systems = Object.fromEntries(
    STATS_TEAMS.map((t) => [t, new Map<string, SystemDemand>()])
  ) as Record<Team, Map<string, SystemDemand>>;
  const pendingRows = Object.fromEntries(
    STATS_TEAMS.map((t) => [t, new Map<string, { system: string; review: number; decision: number }>()])
  ) as Record<Team, Map<string, { system: string; review: number; decision: number }>>;
  for (const t of STATS_TEAMS) {
    for (const s of TEAM_SYSTEMS[t]) {
      systems[t].set(s.value, zeroDemand(s.value));
      pendingRows[t].set(s.value, { system: s.value, review: 0, decision: 0 });
    }
  }
  const demand = (team: Team, system: string): SystemDemand => {
    let d = systems[team].get(system);
    if (!d) { d = zeroDemand(system); systems[team].set(system, d); }
    return d;
  };
  const pendingRow = (team: Team, system: string) => {
    let r = pendingRows[team].get(system);
    if (!r) { r = { system, review: 0, decision: 0 }; pendingRows[team].set(system, r); }
    return r;
  };

  const teamsByUser = new Map<string, Set<Team>>();
  const majors = new TextTally();
  const gradYears = new TextTally();
  const uploads = { submitted: 0, resume: 0, portfolio: 0 };
  const velocity = { createdLastHour: 0, createdLast24h: 0, submittedLastHour: 0, submittedLast24h: 0, accountsLastHour: 0, accountsLast24h: 0 };
  const createdEvents: { ms: number; team: Team }[] = [];
  const submittedEvents: { ms: number; team: Team }[] = [];
  let total = 0;

  const review: RecruitingStats["review"] = {
    pendingReview: zeroTally(),
    unranked: zeroTally(),
    bySystem: Object.fromEntries(
      STATS_TEAMS.map((t) => [t, [] as { system: string; review: number; decision: number }[]])
    ) as RecruitingStats["review"]["bySystem"],
  };
  const offersByTeam = Object.fromEntries(
    STATS_TEAMS.map((t) => [t, zeroOffers()])
  ) as Record<Team, OfferStatusCounts>;
  const interviews: RecruitingStats["interviews"] = {
    offers: zeroOffers(),
    offersByTeam,
    atInterview: zeroTally(),
    picked: zeroTally(),
    awaitingPick: zeroTally(),
    singleLive: zeroTally(),
    sweepPreview: zeroTally(),
    signupLinks: { needed: 0, withLink: 0, missing: [] },
  };
  const decisions: RecruitingStats["decisions"] = {
    trialOffers: zeroTally(),
    trialDecisions: { advanced: zeroTally(), rejected: zeroTally(), waitlisted: zeroTally() },
    byDay: {
      "1": { decided: 0, committed: 0, declined: 0, awaiting: 0, expired: 0 },
      "2": { decided: 0, committed: 0, declined: 0, awaiting: 0, expired: 0 },
      "3": { decided: 0, committed: 0, declined: 0, awaiting: 0, expired: 0 },
    },
    committed: zeroTally(),
    declined: zeroTally(),
    awaitingResponse: zeroTally(),
    waitlisted: zeroTally(),
    autoRejected: { offerExpired: 0, committedElsewhere: 0 },
    reneged: 0,
  };
  const emailCells = new Map<string, { trigger: EmailTrigger; team: Team; eligible: number; sent: number }>();
  for (const trigger of EMAIL_TRIGGERS) for (const team of STATS_TEAMS) emailCells.set(`${trigger}|${team}`, { trigger, team, eligible: 0, sent: 0 });
  const neededLinks = new Set<string>();

  const HOUR = 3600e3, DAY = 24 * HOUR;

  for (const d of appsSnap.docs) {
    const a = d.data();
    if (a.isFakeData) continue;
    if (!isTeam(a.team)) continue;
    const team = a.team;
    const status = (STATUSES.includes(a.status) ? a.status : ApplicationStatus.IN_PROGRESS) as ApplicationStatus;
    const submitted = status !== ApplicationStatus.IN_PROGRESS; // anything past in_progress was submitted at some point

    total++;
    byStatus[status]++;
    byTeam[team].total++;
    byTeam[team].byStatus[status]++;
    if (submitted) { submittedEver++; byTeam[team].submitted++; }

    const createdMs = toMs(a.createdAt);
    if (createdMs !== null) {
      createdEvents.push({ ms: createdMs, team });
      if (now - createdMs < HOUR) velocity.createdLastHour++;
      if (now - createdMs < DAY) velocity.createdLast24h++;
    }
    const submittedMs = submitted ? toMs(a.submittedAt) : null;
    if (submittedMs !== null) {
      submittedEvents.push({ ms: submittedMs, team });
      if (now - submittedMs < HOUR) velocity.submittedLastHour++;
      if (now - submittedMs < DAY) velocity.submittedLast24h++;
    }

    const ranked: string[] = Array.isArray(a.preferredSystems) ? a.preferredSystems.filter((s: unknown) => typeof s === "string") : [];
    ranked.forEach((sys, i) => {
      const dm = demand(team, sys);
      dm.any++;
      if (i === 0) dm.rank1++; else if (i === 1) dm.rank2++; else if (i === 2) dm.rank3++;
      if (submitted) dm.submitted++;
    });
    for (const sys of (Array.isArray(a.rejectedBySystems) ? a.rejectedBySystems : [])) {
      if (typeof sys === "string") demand(team, sys).rejectedBy++;
    }

    // Same normalisation as the sweep's normalizeInterviewOffers: a legacy doc
    // may store a single offer object instead of an array, and the sweep does
    // not require `system` to be a string — the preview must not diverge.
    const rawInterviewOffers: unknown[] = Array.isArray(a.interviewOffers)
      ? a.interviewOffers
      : a.interviewOffers && typeof a.interviewOffers === "object" ? [a.interviewOffers] : [];
    const iOffers = rawInterviewOffers.filter(
      (o): o is { system?: unknown; status?: unknown } => !!o && typeof o === "object"
    );
    const iStatuses = iOffers.map((o) => String(o.status ?? ""));
    for (const o of iOffers) {
      if (typeof o.system !== "string") continue; // demand rows need a name
      const dm = demand(team, o.system);
      dm.interviewOffers++;
      const tc = offersByTeam[team];
      tc.total++;
      const st = String(o.status ?? "");
      if (st === InterviewEventStatus.PENDING) { dm.intPending++; tc.pending++; }
      else if (st === InterviewEventStatus.COMPLETED) { dm.intCompleted++; tc.completed++; }
      else if (st === InterviewEventStatus.CANCELLED) { dm.intCancelled++; tc.cancelled++; }
      else if (st === InterviewEventStatus.NO_SHOW) { dm.intNoShow++; tc.noShow++; }
    }
    const trialOfferCount = (Array.isArray(a.trialOffers) ? a.trialOffers : [])
      .filter((o: unknown): o is { system: string } => !!o && typeof (o as { system?: unknown }).system === "string");
    for (const o of trialOfferCount) {
      demand(team, o.system).trialOffers++;
      bump(decisions.trialOffers, team);
    }

    if (typeof a.userId === "string") {
      if (!teamsByUser.has(a.userId)) teamsByUser.set(a.userId, new Set());
      teamsByUser.get(a.userId)!.add(team);
    }

    if (submitted) {
      uploads.submitted++;
      const fd = a.formData || {};
      if (normalizeText(fd.resumeUrl)) uploads.resume++;
      if (normalizeText(fd.portfolioUrl)) uploads.portfolio++;
      majors.add(fd.major);
      gradYears.add(fd.graduationYear);
    }

    // ---- review lens (dashboard-verbatim) ----
    if (status === ApplicationStatus.SUBMITTED && !a.reviewDecision) {
      bump(review.pendingReview, team);
      if (ranked.length === 0) bump(review.unranked, team);
    }
    for (const sys of ranked) {
      const p = systemPending(a, sys);
      if (p.review) pendingRow(team, sys).review++;
      if (p.decision) pendingRow(team, sys).decision++;
    }

    // ---- interview phase ----
    const hasPick = typeof a.selectedInterviewSystem === "string" && a.selectedInterviewSystem.length > 0;
    if (hasPick) demand(team, a.selectedInterviewSystem).picked++;
    if (status === ApplicationStatus.INTERVIEW) {
      bump(interviews.atInterview, team);
      const liveCount = iStatuses.filter((s) => s === InterviewEventStatus.PENDING).length;
      if (hasPick) bump(interviews.picked, team);
      else if (liveCount > 1) bump(interviews.awaitingPick, team);
      else if (liveCount === 1) bump(interviews.singleLive, team);
      if (closeInterviewsWouldReject(iStatuses, a.selectedInterviewSystem)) bump(interviews.sweepPreview, team);
      for (const o of iOffers) {
        if (typeof o.system === "string" && String(o.status ?? "") === InterviewEventStatus.PENDING) neededLinks.add(`${team}|${o.system}`);
      }
    }

    // ---- trial + decision days ----
    const td = a.trialDecision as string | undefined;
    if (td === "advanced" || td === "rejected" || td === "waitlisted") bump(decisions.trialDecisions[td], team);
    if (status === ApplicationStatus.COMMITTED) bump(decisions.committed, team);
    if (status === ApplicationStatus.DECLINED) bump(decisions.declined, team);
    if (status === ApplicationStatus.ACCEPTED && !a.commitment) bump(decisions.awaitingResponse, team);
    if (status === ApplicationStatus.WAITLISTED) bump(decisions.waitlisted, team);
    const autoReason = a.autoRejected?.reason;
    if (autoReason === "offer_expired") decisions.autoRejected.offerExpired++;
    if (autoReason === "committed_elsewhere") decisions.autoRejected.committedElsewhere++;
    if (typeof a.renegedFrom === "string" && a.renegedFrom) decisions.reneged++;

    // An expired offer's trialDecision was overwritten to "rejected" by the
    // sweep, so the by-day funnel keys on "was ever a final offer": decision
    // still advanced, or auto-rejected for letting it lapse.
    if (td === "advanced" || autoReason === "offer_expired") {
      const day = String(clampDecisionDay(a.trialDecisionDay)) as "1" | "2" | "3";
      const row = decisions.byDay[day];
      row.decided++;
      if (autoReason === "offer_expired") row.expired++;
      else if (status === ApplicationStatus.COMMITTED) row.committed++;
      else if (status === ApplicationStatus.DECLINED) row.declined++;
      else if (status === ApplicationStatus.ACCEPTED && !a.commitment) row.awaiting++;
    }

    // ---- email coverage (same derivation as the trigger-emails job) ----
    const visible = getUserVisibleStatus(a as unknown as Application, config.currentStep);
    const trigger = STATUS_EMAIL_TRIGGERS[visible];
    if (trigger) {
      const cell = emailCells.get(`${trigger}|${team}`)!;
      cell.eligible++;
      if (Array.isArray(a.emailsSent) && a.emailsSent.includes(trigger)) cell.sent++;
    }
  }

  for (const ms of accountTimes) {
    if (now - ms < HOUR) velocity.accountsLastHour++;
    if (now - ms < DAY) velocity.accountsLast24h++;
  }

  // ---- interview offer totals + signup-link coverage ----
  for (const t of STATS_TEAMS) {
    const tc = offersByTeam[t];
    interviews.offers.pending += tc.pending;
    interviews.offers.completed += tc.completed;
    interviews.offers.cancelled += tc.cancelled;
    interviews.offers.noShow += tc.noShow;
    interviews.offers.total += tc.total;
  }
  // Mirror the applicant-facing lookup (app/api/applications/[id]/interview):
  // doc id first, team+system fields as fallback. Several live docs carry
  // stale identity fields from the system renames, and keying on fields alone
  // would raise false "missing link" warnings for systems that book fine.
  const linkByKey = new Map<string, string>();
  const linkById = new Map<string, string>();
  for (const d of interviewConfigsSnap.docs) {
    const c = d.data();
    const link = typeof c.signupLink === "string" ? c.signupLink.trim() : "";
    linkById.set(d.id, link);
    if (typeof c.team === "string" && typeof c.system === "string") linkByKey.set(`${c.team}|${c.system}`, link);
  }
  interviews.signupLinks.needed = neededLinks.size;
  for (const key of neededLinks) {
    const [team, system] = key.split("|");
    const docId = `${team.toLowerCase().replace(/\s+/g, "-")}-${slugifySystem(system)}`;
    if (linkById.get(docId) || linkByKey.get(key)) interviews.signupLinks.withLink++;
    else interviews.signupLinks.missing.push({ team: team as Team, system });
  }
  interviews.signupLinks.missing.sort((a, b) => a.team.localeCompare(b.team) || a.system.localeCompare(b.system));

  for (const t of STATS_TEAMS) {
    review.bySystem[t] = [...pendingRows[t].values()].sort(
      (a, b) => (b.review + b.decision) - (a.review + a.decision) || a.system.localeCompare(b.system)
    );
  }

  // ---- cross-team ----
  const byTeamCount = { 1: 0, 2: 0, 3: 0 };
  const singleTeam = zeroTeams();
  const combos = new Map<string, number>();
  for (const teams of teamsByUser.values()) {
    const n = Math.min(3, teams.size) as 1 | 2 | 3;
    byTeamCount[n]++;
    if (teams.size === 1) singleTeam[[...teams][0]]++;
    if (teams.size > 1) {
      const key = STATS_TEAMS.filter((t) => teams.has(t)).join("+");
      combos.set(key, (combos.get(key) || 0) + 1);
    }
  }

  // ---- time series (sparse 15-minute buckets) ----
  const allTimes = [...createdEvents.map((e) => e.ms), ...submittedEvents.map((e) => e.ms), ...accountTimes];
  const bucketMs = STATS_BUCKET_MINUTES * 60e3;
  const earliest = allTimes.length ? Math.min(...allTimes) : now;
  const from = Math.max(earliest, now - SERIES_MAX_DAYS * DAY);
  const fromBucket = Math.floor(from / bucketMs) * bucketMs;
  const buckets = new Map<number, StatsSeriesPoint>();
  const bucketFor = (ms: number): StatsSeriesPoint => {
    const start = Math.max(fromBucket, Math.floor(ms / bucketMs) * bucketMs); // anything older folds into the first bucket
    let p = buckets.get(start);
    if (!p) { p = { t: new Date(start).toISOString(), created: zeroTeams(), submitted: zeroTeams(), accounts: 0 }; buckets.set(start, p); }
    return p;
  };
  for (const e of createdEvents) bucketFor(e.ms).created[e.team]++;
  for (const e of submittedEvents) bucketFor(e.ms).submitted[e.team]++;
  for (const ms of accountTimes) bucketFor(ms).accounts++;
  const points = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);

  return {
    generatedAt: new Date(now).toISOString(),
    step: config.currentStep,
    accounts: { applicants, staff, applicantsWithCreatedAt },
    applications: { total, submitted: submittedEver, byStatus, byTeam },
    velocity,
    systems: Object.fromEntries(
      STATS_TEAMS.map((t) => [t, [...systems[t].values()].sort((a, b) => b.any - a.any || a.system.localeCompare(b.system))])
    ) as Record<Team, SystemDemand[]>,
    crossTeam: {
      applicants: teamsByUser.size,
      byTeamCount,
      singleTeam,
      combos: [...combos.entries()]
        .map(([key, count]) => ({ teams: key.split("+") as Team[], count }))
        .sort((a, b) => b.count - a.count),
    },
    uploads,
    demographics: { major: majors.top(DEMOGRAPHIC_TOP_N), graduationYear: gradYears.top(DEMOGRAPHIC_TOP_N) },
    review,
    interviews,
    decisions,
    emails: { rows: [...emailCells.values()] },
    series: { bucketMinutes: STATS_BUCKET_MINUTES, from: new Date(fromBucket).toISOString(), to: new Date(now).toISOString(), points },
  };
}

// Module-level cache: the computation reads every application once, which is
// cheap but not free. Five minutes matches how often anyone needs these numbers.
let cached: { stats: RecruitingStats; at: number } | null = null;
let inflight: Promise<RecruitingStats> | null = null;

// Bumped by invalidateRecruitingStats so a compute that was already running
// when the world changed (step advanced, a sweep fired) can't land afterwards
// and re-cache pre-change numbers for five minutes.
let generation = 0;

export async function getRecruitingStats(opts: { fresh?: boolean } = {}): Promise<RecruitingStats> {
  if (!opts.fresh && cached && Date.now() - cached.at < STATS_TTL_MS) return cached.stats;
  if (!inflight) {
    const startedAt = generation;
    inflight = computeRecruitingStats()
      .then((stats) => { if (generation === startedAt) cached = { stats, at: Date.now() }; return stats; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function invalidateRecruitingStats(): void {
  cached = null;
  generation++;
  // A compute started before this point may still be running; the generation
  // check stops it from re-caching, and dropping inflight makes the next
  // caller start a fresh one instead of adopting the stale promise.
  inflight = null;
}

/**
 * Freeze the numbers as they stand into stats_snapshots/{fromStep}. Called by
 * the step-change route on every FORWARD transition, BEFORE the step is
 * written and before any sweep runs — so the snapshot is the world exactly as
 * the outgoing step left it. Always computes fresh (never the 5-min cache).
 * A re-run of the same forward transition overwrites the doc: the newest
 * capture of the actual transition wins.
 */
export async function captureStatsSnapshot(
  fromStep: RecruitingStep,
  toStep: RecruitingStep,
  adminUid: string
): Promise<void> {
  const { series: _series, ...counts } = await computeRecruitingStats();
  const snapshot: StatsSnapshot = {
    ...counts,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    step: fromStep,
    snapshotStep: fromStep,
    nextStep: toStep,
    capturedAt: new Date().toISOString(),
    capturedBy: adminUid,
  };
  await adminDb.collection(SNAPSHOT_COLLECTION).doc(fromStep).set(snapshot);
}

/** All stored snapshots in pipeline order. */
export async function getStatsSnapshots(): Promise<StatsSnapshot[]> {
  const snap = await adminDb.collection(SNAPSHOT_COLLECTION).get();
  const rows = snap.docs
    .map((d) => d.data() as StatsSnapshot)
    .filter((s) => s.schemaVersion === SNAPSHOT_SCHEMA_VERSION && STEP_ORDER.includes(s.snapshotStep));
  rows.sort((a, b) => STEP_ORDER.indexOf(a.snapshotStep) - STEP_ORDER.indexOf(b.snapshotStep));
  return rows;
}

export function toPublicStats(s: RecruitingStats): PublicRecruitingStats {
  return {
    generatedAt: s.generatedAt,
    step: s.step,
    applicantAccounts: s.accounts.applicants,
    applications: {
      total: s.applications.total,
      submitted: s.applications.submitted,
      byStatus: s.applications.byStatus,
      byTeam: Object.fromEntries(
        STATS_TEAMS.map((t) => [t, {
          total: s.applications.byTeam[t].total,
          submitted: s.applications.byTeam[t].submitted,
          inProgress: s.applications.byTeam[t].byStatus[ApplicationStatus.IN_PROGRESS],
        }])
      ) as PublicRecruitingStats["applications"]["byTeam"],
    },
    velocity: s.velocity,
    systems: Object.fromEntries(
      STATS_TEAMS.map((t) => [t, s.systems[t].map((d) => ({ system: d.system, any: d.any, rank1: d.rank1, submitted: d.submitted }))])
    ) as PublicRecruitingStats["systems"],
    crossTeam: s.crossTeam.byTeamCount,
    interviews: {
      atInterview: s.interviews.atInterview.total,
      offersPending: s.interviews.offers.pending,
      offersCompleted: s.interviews.offers.completed,
      picked: s.interviews.picked.total,
      awaitingPick: s.interviews.awaitingPick.total,
    },
    decisions: {
      committed: s.decisions.committed.total,
      declined: s.decisions.declined.total,
      awaitingResponse: s.decisions.awaitingResponse.total,
      waitlisted: s.decisions.waitlisted.total,
    },
  };
}
