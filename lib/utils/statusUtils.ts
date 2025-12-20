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
  RecruitingStep.RELEASE_DECISIONS,
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
function isAtOrPast(currentStep: RecruitingStep, targetStep: RecruitingStep): boolean {
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
  
  // Moving from trial to accepted or rejected
  if (currentStatus === ApplicationStatus.TRIAL) {
    if (newStatus === ApplicationStatus.ACCEPTED) {
      return { field: 'trialDecision', decision: 'advanced' };
    }
    if (newStatus === ApplicationStatus.REJECTED) {
      return { field: 'trialDecision', decision: 'rejected' };
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
  
  // Trial decision visible at RELEASE_DECISIONS
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_DECISIONS)) {
    if (app.trialDecision === 'rejected') {
      return ApplicationStatus.REJECTED;
    }
    if (app.trialDecision === 'advanced') {
      return ApplicationStatus.ACCEPTED;
    }
  }
  
  // If not rejected at any visible stage, show current progression based on step
  // Users see their "in progress" status based on recruiting step
  
  // If we're past trial release and they haven't been rejected, show trial
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL)) {
    // Only show trial if they were advanced from interview
    if (app.interviewDecision === 'advanced' || app.status === ApplicationStatus.TRIAL) {
      return ApplicationStatus.TRIAL;
    }
  }
  
  // If we're past interview release and they haven't been rejected, show interview
  if (isAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS)) {
    // Only show interview if they were advanced from review AND not rejected from interview
    if ((app.reviewDecision === 'advanced' || app.status === ApplicationStatus.INTERVIEW) 
        && app.interviewDecision !== 'rejected') {
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
