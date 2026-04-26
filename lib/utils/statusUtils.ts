import { Application, ApplicationStatus, StageDecision } from "@/lib/models/Application";
import { RecruitingStep } from "@/lib/models/Config";

// Order of recruiting steps for comparison
const STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
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
export function isAtOrPast(currentStep: RecruitingStep | null | undefined, targetStep: RecruitingStep): boolean {
  if (!currentStep) return false;
  return getStepIndex(currentStep) >= getStepIndex(targetStep);
}

/**
 * Determine the stage decision based on the current status and target status.
 * Used when updating status to set the appropriate stage decision.
 */
export function getStageDecisionForStatus(
  currentStatus: ApplicationStatus,
  newStatus: ApplicationStatus
): { field: 'reviewDecision' | 'interviewDecision' | 'trialDecision' | null; decision: StageDecision } {
  // If accepting, always set the trial decision to advanced (final stage passed)
  if (newStatus === ApplicationStatus.ACCEPTED) {
    return { field: 'trialDecision', decision: 'advanced' };
  }

  // Moving from submitted/in_progress to interview or rejected
  if (currentStatus === ApplicationStatus.SUBMITTED || currentStatus === ApplicationStatus.IN_PROGRESS) {
    if (newStatus === ApplicationStatus.INTERVIEW) {
      return { field: 'reviewDecision', decision: 'advanced' };
    }
    if (newStatus === ApplicationStatus.REJECTED) {
      return { field: 'reviewDecision', decision: 'rejected' };
    }
  }

  // Moving from interview to trial or rejected
  if (currentStatus === ApplicationStatus.INTERVIEW) {
    if (newStatus === ApplicationStatus.TRIAL) {
      return { field: 'interviewDecision', decision: 'advanced' };
    }
    if (newStatus === ApplicationStatus.REJECTED) {
      return { field: 'interviewDecision', decision: 'rejected' };
    }
  }

  // Moving from trial to rejected or waitlisted
  if (currentStatus === ApplicationStatus.TRIAL) {
    if (newStatus === ApplicationStatus.REJECTED) {
      return { field: 'trialDecision', decision: 'rejected' };
    }
    if (newStatus === ApplicationStatus.WAITLISTED) {
      return { field: 'trialDecision', decision: 'waitlisted' };
    }
  }

  // Also allow waitlisting from interview stage (in case there's no trial workday phase)
  if (currentStatus === ApplicationStatus.INTERVIEW) {
    if (newStatus === ApplicationStatus.WAITLISTED) {
      return { field: 'trialDecision', decision: 'waitlisted' };
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
  // Trial decision visible based on which day the decision was made
  // Day 1 decisions visible at DAY1+, Day 2 decisions visible at DAY2+, Day 3 decisions visible at DAY3+
  const trialDecisionDay = app.trialDecisionDay || 1; // Default to day 1 for backwards compatibility

  // Map decision day to the recruiting step when it becomes visible
  const dayToStep: Record<1 | 2 | 3, RecruitingStep> = {
    1: RecruitingStep.RELEASE_DECISIONS_DAY1,
    2: RecruitingStep.RELEASE_DECISIONS_DAY2,
    3: RecruitingStep.RELEASE_DECISIONS_DAY3,
  };

  const decisionVisibleAtStep = dayToStep[trialDecisionDay];

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
  if (isAtOrPast(currentStep, decisionVisibleAtStep)) {
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
    status: rawStatus,
    ...safeData
  } = app;
  
  const sanitized: Partial<Application> = { 
    ...safeData, 
    status: visibleStatus 
  };

  // Hide interview offers until they are released
  if (!isAtOrPast(step, RecruitingStep.RELEASE_INTERVIEWS)) {
    delete sanitized.interviewOffers;
  }

  // Hide trial offers until they are released
  if (!isAtOrPast(step, RecruitingStep.RELEASE_TRIAL)) {
    delete sanitized.trialOffers;
  }

  // Hide final acceptance offer until decisions are released
  if (!isAtOrPast(step, RecruitingStep.RELEASE_DECISIONS_DAY1)) {
    delete sanitized.offer;
  }
  
  return sanitized;
}
