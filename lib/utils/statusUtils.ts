import { Application, ApplicationStatus, StageDecision } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";

// Order of recruiting steps for comparison
export const STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.PRE_OPEN,
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.CLOSE_INTERVIEWS,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS_DAY1,
  RecruitingStep.RELEASE_DECISIONS_DAY2,
  RecruitingStep.RELEASE_DECISIONS_DAY3,
];

/**
 * Get the index of a step in the order (for comparison).
 */
function getStepIndex(step: RecruitingStep): number {
  return STEP_ORDER.indexOf(step);
}

/**
 * Check if we're at or past a given step.
 */
/** A stored decision day outside 1–3 must fail closed (day 1 semantics), never index to undefined. */
export function clampDecisionDay(day: unknown): 1 | 2 | 3 {
  return day === 2 || day === 3 ? day : 1;
}

export function isAtOrPast(currentStep: RecruitingStep | null | undefined, targetStep: RecruitingStep): boolean {
  if (!currentStep) return false;
  return getStepIndex(currentStep) >= getStepIndex(targetStep);
}

/**
 * The step at which a trial decision stamped for a given day becomes visible:
 * day 1 decisions release at DAY1, day 2 at DAY2, day 3 at DAY3.
 */
const DECISION_DAY_STEP: Record<1 | 2 | 3, RecruitingStep> = {
  1: RecruitingStep.RELEASE_DECISIONS_DAY1,
  2: RecruitingStep.RELEASE_DECISIONS_DAY2,
  3: RecruitingStep.RELEASE_DECISIONS_DAY3,
};

/**
 * Whether this application's final decision — and so its offer — has reached
 * its release day. The single source of truth for that question: masking in
 * getUserVisibleStatus, offer stripping in sanitizeApplicationForApplicant,
 * and the commit path's decision about which rival offers a commit may
 * decline all ask it, and they must never disagree.
 *
 * Takes the raw stored shape rather than a hydrated Application so callers
 * holding a Firestore document can use it too.
 */
export function isOfferReleased(
  app: { trialDecisionDay?: unknown },
  step: RecruitingStep
): boolean {
  return isAtOrPast(step, DECISION_DAY_STEP[clampDecisionDay(app.trialDecisionDay)]);
}

/**
 * Determine the stage decision based on the current status and target status.
 * Used when updating status to set the appropriate stage decision.
 */
export function getStageDecisionForStatus(
  currentStatus: ApplicationStatus,
  newStatus: ApplicationStatus,
  currentStep?: RecruitingStep
): { field: 'reviewDecision' | 'interviewDecision' | 'trialDecision' | null; decision: StageDecision } {
  // If accepting, always set the trial decision to advanced (final stage passed)
  if (newStatus === ApplicationStatus.ACCEPTED) {
    return { field: 'trialDecision', decision: 'advanced' };
  }

  // When setting status to REJECTED, pick the decision field from the earlier of the
  // applicant's actual progress and the global step's release position. Status alone
  // would mask a decision made before its stage was released; step alone would mask a
  // rejection of a straggler who never advanced (e.g. still SUBMITTED at trial time
  // would get trialDecision, gated behind decision-day release, and keep showing
  // "Submitted" — reviewDecision is already visible then).
  if (newStatus === ApplicationStatus.REJECTED) {
    const stageFields = ['reviewDecision', 'interviewDecision', 'trialDecision'] as const;

    let statusStage = 0;
    if (currentStatus === ApplicationStatus.INTERVIEW) {
      statusStage = 1;
    } else if (
      // Statuses at or past the trial stage: rejecting from any of them is a
      // trial-stage decision (e.g. rescinding an acceptance or closing the
      // waitlist), so it keeps the decision-day stagger and funnel history.
      currentStatus === ApplicationStatus.TRIAL ||
      currentStatus === ApplicationStatus.ACCEPTED ||
      currentStatus === ApplicationStatus.WAITLISTED ||
      currentStatus === ApplicationStatus.COMMITTED ||
      currentStatus === ApplicationStatus.DECLINED
    ) {
      statusStage = 2;
    }

    let stage = statusStage;
    if (currentStep) {
      let stepStage = 2;
      if (!isAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS)) {
        stepStage = 0;
      } else if (!isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL)) {
        stepStage = 1;
      }
      stage = Math.min(statusStage, stepStage);
    }

    return { field: stageFields[stage], decision: 'rejected' };
  }

  // Moving from submitted/in_progress to interview
  if (currentStatus === ApplicationStatus.SUBMITTED || currentStatus === ApplicationStatus.IN_PROGRESS) {
    if (newStatus === ApplicationStatus.INTERVIEW) {
      return { field: 'reviewDecision', decision: 'advanced' };
    }
  }

  // A waitlist is always a final-stage decision, whatever the applicant's
  // current status: rescinding an acceptance to the waitlist, or waitlisting a
  // straggler still at SUBMITTED, must overwrite trialDecision, or the
  // applicant keeps seeing the previous outcome (an ACCEPTED applicant kept
  // their Accept button, and it 500'd). Visibility is still gated by the
  // decision day the caller stamps alongside this.
  if (newStatus === ApplicationStatus.WAITLISTED) {
    return { field: 'trialDecision', decision: 'waitlisted' };
  }

  // Moving from interview to trial
  if (currentStatus === ApplicationStatus.INTERVIEW) {
    if (newStatus === ApplicationStatus.TRIAL) {
      return { field: 'interviewDecision', decision: 'advanced' };
    }
  }

  return { field: null, decision: 'pending' };
}

/**
 * Get the user-visible status based on the application's real status
 * and stage decisions, considering the current global recruiting step.
 * 
 * This determines what the user should SEE, not what the actual status is.
 */
export function getUserVisibleStatus(
  app: Application,
  currentStep: RecruitingStep
): ApplicationStatus {
  // If they have already committed or declined, show that status immediately
  if (app.status === ApplicationStatus.COMMITTED || app.status === ApplicationStatus.DECLINED) {
    return app.status;
  }

  // Check for earliest rejection that's now visible

  // Review decision visible at RELEASE_INTERVIEWS
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS)) {
    if (app.reviewDecision === 'rejected') {
      return ApplicationStatus.REJECTED;
    }
  }

  // Interview decision visible at RELEASE_TRIAL
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL)) {
    if (app.interviewDecision === 'rejected') {
      return ApplicationStatus.REJECTED;
    }
  }

  // Trial decisions (Accept/Reject/Waitlist) are gated by their decision day
  if (isOfferReleased(app, currentStep)) {
    if (app.trialDecision === 'rejected') {
      return ApplicationStatus.REJECTED;
    }
    if (app.trialDecision === 'waitlisted') {
      return ApplicationStatus.WAITLISTED;
    }
    if (app.trialDecision === 'advanced') {
      return ApplicationStatus.ACCEPTED;
    }
  }

  // If not decided at any visible stage, show current progression based on step
  // Users see their "in progress" status based on recruiting step

  // If we're past trial release and they haven't been rejected, show trial
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL)) {
    // Show trial ONLY if they have trial offers.
    // If they were erroneously advanced and then rejected/reverted,
    // their trial offers were cleared, so they should not see Trial Workday.
    if (app.trialOffers && app.trialOffers.length > 0) {
      return ApplicationStatus.TRIAL;
    }
  }

  // If we're past interview release and they haven't been rejected, show interview
  // Note: interviewDecision rejection is NOT checked here - it's only visible at RELEASE_TRIAL
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS)) {
    // Only show interview if they were advanced from review, have active status INTERVIEW,
    // or if they have an interview decision or interview offers (meaning they made it to this stage).
    if (app.reviewDecision === 'advanced' || 
        app.status === ApplicationStatus.INTERVIEW ||
        app.interviewDecision === 'rejected' ||
        app.interviewDecision === 'advanced' ||
        (app.interviewOffers && app.interviewOffers.length > 0)) {
      return ApplicationStatus.INTERVIEW;
    }
  }

  // Default: show submitted
  if (app.status === ApplicationStatus.IN_PROGRESS) {
    return ApplicationStatus.IN_PROGRESS;
  }

  return ApplicationStatus.SUBMITTED;
}

/**
 * Check if an applicant should see the interview scheduler.
 * They should see it if their visible status is INTERVIEW.
 */
export function shouldShowInterviewScheduler(
  app: Application,
  currentStep: RecruitingStep
): boolean {
  const visibleStatus = getUserVisibleStatus(app, currentStep);
  return visibleStatus === ApplicationStatus.INTERVIEW;
}

/**
 * Check if an applicant should see the trial workday section.
 * They should see it if their visible status is TRIAL.
 */
export function shouldShowTrialSection(
  app: Application,
  currentStep: RecruitingStep
): boolean {
  const visibleStatus = getUserVisibleStatus(app, currentStep);
  return visibleStatus === ApplicationStatus.TRIAL;
}

/**
 * Sanitizes and masks the application data for applicant viewing.
 * Removes internal decision fields and masks status based on recruiting step.
 */
export function sanitizeApplicationForApplicant(app: Application, step: RecruitingStep): Partial<Application> {
  const visibleStatus = getUserVisibleStatus(app, step);
  
  // Remove sensitive internal fields
  const {
    reviewDecision,
    interviewDecision,
    trialDecision,
    trialDecisionDay,
    emailsSent,
    aggregateRatings,
    rejectedBySystems,
    autoRejected,
    renegedFrom,
    waitlistSystem,
    lastEditSession,
    status: rawStatus,
    ...safeData
  } = app;
  
  const sanitized: Partial<Application> = { 
    ...safeData, 
    status: visibleStatus 
  };

  // Whether the applicant may still edit, without revealing why. The form
  // keeps editing a "Submitted" application while the window is open, but
  // once a lead has advanced it the real status is past submitted and every
  // save would fail (#111). Deliberately the only per-applicant signal here:
  // anything keyed on offers or rejections would leak a masked decision.
  sanitized.editable =
    rawStatus === ApplicationStatus.IN_PROGRESS ||
    rawStatus === ApplicationStatus.SUBMITTED ||
    // A rejection made while applications are open is masked, so the form
    // must not freeze on it — the applicant PATCH accepts the edit and leaves
    // the decision untouched. Only an early advance freezes the form (#118).
    rawStatus === ApplicationStatus.REJECTED;

  // Hide interview offers until they are released
  if (!isAtOrPast(step, RecruitingStep.RELEASE_INTERVIEWS)) {
    delete sanitized.interviewOffers;
  } else if (sanitized.interviewOffers) {
    // The cancel reason is a staff note (#75); the applicant sees fixed copy.
    sanitized.interviewOffers = sanitized.interviewOffers.map(({ cancelReason: _internal, ...offer }) => offer);
  }

  // Hide trial offers until they are released
  if (!isAtOrPast(step, RecruitingStep.RELEASE_TRIAL)) {
    delete sanitized.trialOffers;
  }

  // Hide the final acceptance offer until ITS release day (#58): a Day-2
  // acceptance used to ride along in Day-1 payloads while the status still
  // read "Trial Workday".
  if (!isOfferReleased(app, step)) {
    delete sanitized.offer;
  }
  
  return sanitized;
}
