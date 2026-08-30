import {
  Application,
  ApplicationStatus,
  InterviewEventStatus,
} from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";

/**
 * The status a staff member should see on an application.
 *
 * `application.status` is the applicant's global pipeline stage: the moment
 * *any* system offers an interview it becomes `interview`. Admins and captains
 * want exactly that. A system lead or reviewer does not — to them the useful
 * question is "what has MY system done with this applicant", and a badge that
 * says "Interview" because Dynamics acted makes an application Powertrain has
 * never opened fall out of Powertrain's "Submitted" queue.
 *
 * So for leads/reviewers the badge is per-system, symmetrically with how
 * rejections already display: Rejected = we rejected, Trial = we offered a
 * trial, Interview = we offered an interview, Submitted = we have not acted.
 * Global end states (draft, globally rejected, accepted, waitlisted,
 * committed, declined) describe the applicant as a whole and show as-is.
 *
 * `elsewhere` carries the context the per-system badge no longer does: the
 * furthest stage another system has taken the applicant to, when that is
 * further than the viewer's own system has. An applicant can hold offers from
 * several systems until they pick one, so a lead sees "Submitted · interview
 * with Aerodynamics" rather than a bare "Submitted".
 *
 * Presentation only. Every action gate keys on the real `status`.
 */
export type StaffDisplayStatus = {
  status: ApplicationStatus;
  elsewhere?: {
    status: ApplicationStatus.INTERVIEW | ApplicationStatus.TRIAL;
    systems: string[];
  };
};

type Viewer = {
  role?: UserRole | string;
  memberProfile?: { system?: string | null } | null;
} | null | undefined;

// Structural, not Pick<Application>: the admin list and detail views carry
// their own narrowed application shapes (offers typed loosely, dates as
// strings) and this must accept all of them.
type OfferLike = { system: string; status: InterviewEventStatus | string };
type AppLike = {
  status: Application["status"];
  rejectedBySystems?: string[] | null;
  interviewOffers?: OfferLike[] | null;
  trialOffers?: OfferLike[] | null;
};

// Statuses that describe the applicant as a whole, not one system's decision.
const GLOBAL_STATES = new Set<ApplicationStatus>([
  ApplicationStatus.IN_PROGRESS,
  ApplicationStatus.REJECTED,
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.COMMITTED,
  ApplicationStatus.DECLINED,
]);

const STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
  [ApplicationStatus.SUBMITTED]: 0,
  [ApplicationStatus.REJECTED]: 0,
  [ApplicationStatus.INTERVIEW]: 1,
  [ApplicationStatus.TRIAL]: 2,
};

const uniq = (xs: string[]) => Array.from(new Set(xs));

export function getStaffDisplayStatus(app: AppLike, viewer: Viewer): StaffDisplayStatus {
  const system = viewer?.memberProfile?.system;
  const perSystem =
    !!system &&
    viewer?.role !== UserRole.ADMIN &&
    viewer?.role !== UserRole.TEAM_CAPTAIN_OB;
  if (!perSystem || GLOBAL_STATES.has(app.status)) {
    return { status: app.status };
  }

  // A cancelled offer is no offer (staff cancellation, or the applicant chose
  // another system's interview). Completed and no-show offers still place the
  // applicant at that stage for the system that made them.
  const live = (offers?: OfferLike[] | null) =>
    (offers ?? []).filter((o) => o.status !== InterviewEventStatus.CANCELLED);
  const interviews = live(app.interviewOffers);
  const trials = live(app.trialOffers);

  const mine: ApplicationStatus = (app.rejectedBySystems ?? []).includes(system)
    ? ApplicationStatus.REJECTED
    : trials.some((o) => o.system === system)
      ? ApplicationStatus.TRIAL
      : interviews.some((o) => o.system === system)
        ? ApplicationStatus.INTERVIEW
        : ApplicationStatus.SUBMITTED;

  const othersTrial = uniq(trials.filter((o) => o.system !== system).map((o) => o.system));
  const othersInterview = uniq(interviews.filter((o) => o.system !== system).map((o) => o.system));
  const elsewhere: StaffDisplayStatus["elsewhere"] = othersTrial.length
    ? { status: ApplicationStatus.TRIAL, systems: othersTrial }
    : othersInterview.length
      ? { status: ApplicationStatus.INTERVIEW, systems: othersInterview }
      : undefined;

  if (elsewhere && (STAGE_RANK[elsewhere.status] ?? 0) > (STAGE_RANK[mine] ?? 0)) {
    return { status: mine, elsewhere };
  }
  return { status: mine };
}

/** "Interview · Dynamics, Body" — the hint rendered beside a per-system badge. */
export function formatElsewhere(elsewhere: NonNullable<StaffDisplayStatus["elsewhere"]>): string {
  const label = elsewhere.status === ApplicationStatus.TRIAL ? "Trial" : "Interview";
  return `${label} · ${elsewhere.systems.join(", ")}`;
}
