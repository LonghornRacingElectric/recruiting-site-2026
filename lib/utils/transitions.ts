import { ApplicationStatus } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";
import { UserRole } from "@/lib/models/User";
import { isAtOrPast } from "@/lib/utils/statusUtils";
import { DRAFT_ACTION_ERROR } from "@/lib/auth/teamAccess";

/**
 * The one place that says which status changes staff may make.
 *
 * Before this table the single-application status route validated only that
 * the target was *a* status: a draft could be advanced (froze the applicant's
 * form), a committed applicant could be rejected (saw Rejected while still
 * committed), `committed` could be set by hand (triggered the decision-day
 * sweep), and a system lead could reject team-wide through a door the
 * per-system rule never saw. Bulk had step floors; the single route had none.
 * Both routes and the reject route now consult this.
 *
 * Deliberate policy (2026-08-28): advancing to Interview is allowed from the
 * `open` step — leads review while applications are still open. The applicant's
 * form goes read-only at that point (#111).
 */

const S = ApplicationStatus;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [S.IN_PROGRESS]: "In Progress",
  [S.SUBMITTED]: "Submitted",
  [S.INTERVIEW]: "Interview",
  [S.TRIAL]: "Trial",
  [S.ACCEPTED]: "Accepted",
  [S.REJECTED]: "Rejected",
  [S.WAITLISTED]: "Waitlisted",
  [S.COMMITTED]: "Committed",
  [S.DECLINED]: "Declined",
};

interface TransitionRule {
  /** Statuses an application may be in for staff to move it to the target. */
  from: ApplicationStatus[];
  /** Earliest recruiting step at which the move is allowed. */
  minStep: RecruitingStep;
  stepError: string;
  /** If set, only these roles may make the move (default: any non-reviewer staff). */
  roles?: UserRole[];
}

export const STAFF_TRANSITIONS: Partial<Record<ApplicationStatus, TransitionRule>> = {
  // "Revert to Submitted" — a fresh review. Also force-submits a draft.
  [S.SUBMITTED]: {
    from: [S.IN_PROGRESS, S.INTERVIEW, S.TRIAL, S.REJECTED, S.WAITLISTED, S.ACCEPTED],
    minStep: RecruitingStep.OPEN,
    stepError: "Applications can't be changed before the cycle opens.",
    roles: [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB],
  },
  [S.INTERVIEW]: {
    from: [S.SUBMITTED, S.INTERVIEW, S.REJECTED],
    minStep: RecruitingStep.OPEN,
    stepError: "Interview offers can't be extended before the cycle opens.",
  },
  // SUBMITTED is included so a straggler can be fast-tracked with an explicit
  // system. WAITLISTED is deliberately not: a fresh trial offer clears the
  // final decision, which would un-reveal a waitlist the applicant has seen.
  [S.TRIAL]: {
    from: [S.SUBMITTED, S.INTERVIEW, S.TRIAL, S.REJECTED],
    minStep: RecruitingStep.INTERVIEWING,
    stepError: "Trial offers can't be extended until the Interviewing step.",
  },
  // Decision mode in the detail view starts at release_trial, so the floor
  // matches it (bulk used to say trial_workday; the two now agree).
  [S.ACCEPTED]: {
    from: [S.INTERVIEW, S.TRIAL, S.WAITLISTED, S.ACCEPTED, S.REJECTED],
    minStep: RecruitingStep.RELEASE_TRIAL,
    stepError: "Acceptances can't be issued until trial offers are released.",
  },
  [S.WAITLISTED]: {
    from: [S.INTERVIEW, S.TRIAL, S.WAITLISTED, S.ACCEPTED, S.REJECTED],
    minStep: RecruitingStep.RELEASE_TRIAL,
    stepError: "Waitlist decisions can't be made until trial offers are released.",
  },
  // REJECTED -> REJECTED keeps per-system rejections idempotent: a second
  // system recording its rejection after the first made it final.
  [S.REJECTED]: {
    from: [S.SUBMITTED, S.INTERVIEW, S.TRIAL, S.WAITLISTED, S.ACCEPTED, S.REJECTED],
    minStep: RecruitingStep.OPEN,
    stepError: "Applications can't be rejected before the cycle opens.",
  },
  // in_progress, committed and declined are never staff-settable: the first
  // is the applicant's draft, the last two are the applicant's own decision.
};

export interface TransitionInput {
  from: ApplicationStatus;
  to: ApplicationStatus;
  role: UserRole;
  step: RecruitingStep;
  /**
   * True when a lead's rejection is going through the per-system path
   * (`/reject`, or bulk reject scoped to their system). A lead may not reject
   * through the plain status route, which would reject for every system.
   */
  perSystemReject?: boolean;
}

export interface TransitionRefusal {
  status: 400 | 403;
  error: string;
}

export function validateStaffTransition(input: TransitionInput): TransitionRefusal | null {
  const { from, to, role, step, perSystemReject } = input;
  const label = (s: ApplicationStatus) => STATUS_LABELS[s] ?? s;

  if (role === UserRole.REVIEWER) {
    return { status: 403, error: "Reviewers are not authorized to advance or reject applicants" };
  }

  if (from === S.IN_PROGRESS && to !== S.SUBMITTED) {
    return { status: 400, error: DRAFT_ACTION_ERROR };
  }

  if (from === S.COMMITTED || from === S.DECLINED) {
    return {
      status: 400,
      error: `This applicant has already ${from === S.COMMITTED ? "committed" : "declined"}, so their application can't be changed. Ask an admin if that's wrong.`,
    };
  }

  const rule = STAFF_TRANSITIONS[to];
  if (!rule) {
    const why = to === S.IN_PROGRESS ? "that would reopen it as a draft" : "that is the applicant's own decision";
    return { status: 400, error: `Applications can't be set to ${label(to)} by staff — ${why}.` };
  }

  if (!rule.from.includes(from)) {
    return { status: 400, error: `Can't move an application from ${label(from)} to ${label(to)}.` };
  }

  if (!isAtOrPast(step, rule.minStep)) {
    return { status: 400, error: rule.stepError };
  }

  if (rule.roles && !rule.roles.includes(role)) {
    const what = from === S.IN_PROGRESS
      ? "submit an application on the applicant's behalf"
      : `move an application back to ${label(to)}`;
    return { status: 403, error: `Only admins and team captains can ${what}.` };
  }

  if (to === S.REJECTED && role === UserRole.SYSTEM_LEAD && !perSystemReject) {
    return {
      status: 403,
      error: "System leads reject per system — use the Reject button, which records the rejection for your system only.",
    };
  }

  return null;
}
