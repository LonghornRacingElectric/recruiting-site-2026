import { adminDb } from "./admin";
import { getRecruitingConfig } from "./config";
import { Team, UserRole } from "@/lib/models/User";
import { ApplicationStatus } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";

/**
 * Aggregate recruiting statistics.
 *
 * Everything here is a count. No document in the response carries a name, an
 * email, a uid, or free text — the stats page is meant to be safe to
 * screenshot into Slack, and /api/stats hands a further-reduced subset to the
 * recruiting bot. Keep it that way: add numbers, never records.
 *
 * History is derived from timestamps already on the data (createdAt,
 * submittedAt, user createdAt) rather than stored snapshots, so there is no
 * cron to keep alive. One consequence: an application that is submitted and
 * later reopened drops out of the "submitted" history entirely.
 */

export const STATS_BUCKET_MINUTES = 15;
const STATS_TTL_MS = 5 * 60 * 1000;
const SERIES_MAX_DAYS = 90;
const DEMOGRAPHIC_TOP_N = 15;

export const STATS_TEAMS: Team[] = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];
const STATUSES = Object.values(ApplicationStatus) as ApplicationStatus[];

export type TeamCounts = Record<Team, number>;
export type StatusCounts = Record<ApplicationStatus, number>;

const zeroTeams = (): TeamCounts => ({ [Team.ELECTRIC]: 0, [Team.SOLAR]: 0, [Team.COMBUSTION]: 0 });
const zeroStatuses = (): StatusCounts =>
  Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;

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
    combos: { teams: Team[]; count: number }[];
  };
  uploads: { submitted: number; resume: number; portfolio: number };
  demographics: {
    major: { value: string; count: number }[];
    graduationYear: { value: string; count: number }[];
  };
  series: { bucketMinutes: number; from: string; to: string; points: StatsSeriesPoint[] };
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
  const [config, appsSnap, usersSnap] = await Promise.all([
    getRecruitingConfig(),
    adminDb
      .collection("applications")
      .select(
        "team", "status", "preferredSystems", "createdAt", "submittedAt", "isFakeData", "userId",
        "rejectedBySystems", "interviewOffers", "trialOffers",
        "formData.major", "formData.graduationYear", "formData.resumeUrl", "formData.portfolioUrl"
      )
      .get(),
    adminDb.collection("users").select("role", "createdAt").get(),
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
  const systems = Object.fromEntries(
    STATS_TEAMS.map((t) => [t, new Map<string, SystemDemand>()])
  ) as Record<Team, Map<string, SystemDemand>>;
  for (const t of STATS_TEAMS) {
    for (const s of TEAM_SYSTEMS[t]) {
      systems[t].set(s.value, { system: s.value, any: 0, rank1: 0, rank2: 0, rank3: 0, submitted: 0, rejectedBy: 0, interviewOffers: 0, trialOffers: 0 });
    }
  }
  const demand = (team: Team, system: string): SystemDemand => {
    let d = systems[team].get(system);
    if (!d) { d = { system, any: 0, rank1: 0, rank2: 0, rank3: 0, submitted: 0, rejectedBy: 0, interviewOffers: 0, trialOffers: 0 }; systems[team].set(system, d); }
    return d;
  };

  const teamsByUser = new Map<string, Set<Team>>();
  const majors = new TextTally();
  const gradYears = new TextTally();
  const uploads = { submitted: 0, resume: 0, portfolio: 0 };
  const velocity = { createdLastHour: 0, createdLast24h: 0, submittedLastHour: 0, submittedLast24h: 0, accountsLastHour: 0, accountsLast24h: 0 };
  const createdEvents: { ms: number; team: Team }[] = [];
  const submittedEvents: { ms: number; team: Team }[] = [];
  let total = 0;

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
    for (const o of (Array.isArray(a.interviewOffers) ? a.interviewOffers : [])) {
      if (o && typeof o.system === "string") demand(team, o.system).interviewOffers++;
    }
    for (const o of (Array.isArray(a.trialOffers) ? a.trialOffers : [])) {
      if (o && typeof o.system === "string") demand(team, o.system).trialOffers++;
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
  }

  for (const ms of accountTimes) {
    if (now - ms < HOUR) velocity.accountsLastHour++;
    if (now - ms < DAY) velocity.accountsLast24h++;
  }

  // ---- cross-team ----
  const byTeamCount = { 1: 0, 2: 0, 3: 0 };
  const combos = new Map<string, number>();
  for (const teams of teamsByUser.values()) {
    const n = Math.min(3, teams.size) as 1 | 2 | 3;
    byTeamCount[n]++;
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
      combos: [...combos.entries()]
        .map(([key, count]) => ({ teams: key.split("+") as Team[], count }))
        .sort((a, b) => b.count - a.count),
    },
    uploads,
    demographics: { major: majors.top(DEMOGRAPHIC_TOP_N), graduationYear: gradYears.top(DEMOGRAPHIC_TOP_N) },
    series: { bucketMinutes: STATS_BUCKET_MINUTES, from: new Date(fromBucket).toISOString(), to: new Date(now).toISOString(), points },
  };
}

// Module-level cache: the computation reads every application once, which is
// cheap but not free. Five minutes matches how often anyone needs these numbers.
let cached: { stats: RecruitingStats; at: number } | null = null;
let inflight: Promise<RecruitingStats> | null = null;

export async function getRecruitingStats(opts: { fresh?: boolean } = {}): Promise<RecruitingStats> {
  if (!opts.fresh && cached && Date.now() - cached.at < STATS_TTL_MS) return cached.stats;
  if (!inflight) {
    inflight = computeRecruitingStats()
      .then((stats) => { cached = { stats, at: Date.now() }; return stats; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function invalidateRecruitingStats(): void {
  cached = null;
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
  };
}
