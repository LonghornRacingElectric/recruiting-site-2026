import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "./User";

export enum ApplicationStatus {
  IN_PROGRESS = "in_progress",
  SUBMITTED = "submitted",
  INTERVIEW = "interview",
  TRIAL = "trial",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  WAITLISTED = "waitlisted",
  COMMITTED = "committed",
  DECLINED = "declined",
}

// Stage-specific decision tracking
export type StageDecision = 'pending' | 'advanced' | 'rejected' | 'waitlisted';

// Interview offer status. Staff set COMPLETED/CANCELLED/NO_SHOW manually
// (see app/api/admin/applications/[id]/interview/[system]/route.ts) since
// booking happens on an external signup link the app doesn't control.
export enum InterviewEventStatus {
  PENDING = "pending",           // Offer extended, not yet declined/resolved
  CANCELLED = "cancelled",       // Declined by applicant (chose another system) or cancelled by staff
  COMPLETED = "completed",       // Interview took place
  NO_SHOW = "no_show",           // Applicant didn't show up
}

export interface InterviewOffer {
  system: string;                      // The system offering the interview (e.g., "Electronics")
  status: InterviewEventStatus;
  createdAt: Date;                     // When offer was created by admin
  cancelledAt?: Date;                  // When cancelled (if applicable)
  cancelReason?: string;               // Reason for cancellation
}

// Trial workday offer - similar structure to InterviewOffer
export interface TrialOffer {
  system: string;                      // The system offering the trial (e.g., "Electronics")
  status: InterviewEventStatus;        // Reuse same status enum
  createdAt: Date;                     // When offer was created by admin
  
  // Applicant response fields
  respondedAt?: Date;                  // When applicant responded
  accepted?: boolean;                  // true = accepted, false = rejected, undefined = pending
  rejectionReason?: string;            // Reason if rejected
}

export interface ApplicationFormData {
  whyJoin?: string;
  relevantExperience?: string;
  // NOTE: the live config relabelled this question to "Phone Number" — it is not
  // a weekly-availability answer for anyone who applied after 2026-04-28.
  // See lib/utils/formAnswers.ts for why.
  availability?: string;
  resumeUrl?: string;
  // Optional portfolio upload — any creative work, not just engineering.
  // Deliberately has no page limit and a larger size cap than the resume.
  portfolioUrl?: string;
  graduationYear?: string;
  major?: string;
  // Team-specific question answers, keyed by question ID
  teamQuestions?: Record<string, string>;
  // Answers to common questions that have no named field above — i.e. anything
  // added through the admin Questions tab. Keyed by question ID.
  // Read with getCommonAnswer() rather than reaching in directly.
  customAnswers?: Record<string, string>;
}

export interface Application {
  id: string;
  userId: string;
  
  // Denormalized user data (to avoid lookup on list views)
  userName?: string;
  userEmail?: string;
  
  team: Team;
  
  // Multiple systems the applicant is interested in
  preferredSystems?: (ElectricSystem | SolarSystem | CombustionSystem)[];

  // Full ranked list before selectInterviewSystem narrows preferredSystems to
  // the chosen system. Set once, on first selection — never overwritten.
  originalPreferredSystems?: (ElectricSystem | SolarSystem | CombustionSystem)[];
  
  status: ApplicationStatus;
  
  // Stage-specific decisions (visible to user at next recruiting step)
  reviewDecision?: StageDecision;      // Decision from review stage
  interviewDecision?: StageDecision;   // Decision from interview stage  
  trialDecision?: StageDecision;       // Decision from trial stage
  
  // Track which release day the trial decision was made (1, 2, or 3)
  // Decision is only visible to applicant on or after this day
  trialDecisionDay?: 1 | 2 | 3;

  /** System the waitlist decision was made for (the modal's pick). Staff-facing only. */
  waitlistSystem?: string;

  // Offer Details
  offer?: {
    system: string;
    role: string;
    details?: string;
    issuedAt: Date;
  };

  // Automated emails sent tracking to avoid duplicate sends
  emailsSent?: string[];

  // Internal flags
  isFakeData?: boolean;

  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;

  // Two-tab conflict detection for the apply form (#127): the tab that last
  // saved, and when. A save from a different tab whose copy predates
  // lastEditAt is refused so an older form never overwrites a newer one.
  // lastEditSession never reaches the applicant payload.
  lastEditSession?: string;
  lastEditAt?: Date;

  formData: ApplicationFormData;

  // Interview-related fields 
  interviewOffers?: InterviewOffer[];       // Systems offering interviews
  selectedInterviewSystem?: string;         // For Combustion/Electric: chosen system
  
  // Trial workday offers
  trialOffers?: TrialOffer[];               // Systems offering trial workdays
  
  // Rejection tracking
  rejectedBySystems?: string[];             // Systems that have rejected this applicant
  
  // Aggregate ratings per system (updated atomically on scorecard submission)
  aggregateRatings?: {
    [system: string]: {
      reviewRating?: number;      // Application review aggregate score
      interviewRating?: number;   // Interview aggregate score
      lastUpdated: Date;
    };
  };

  // Applicant commitment response (the accept/decline — one-shot and final)
  commitment?: {
    accepted: boolean;
    reason?: string;      // Reason for declining
    committedAt: Date;
  };

  // Set by the decision-advance sweep when this application was auto-rejected:
  // the applicant either let their offer expire unanswered, or committed to a
  // different team. Staff-facing "why is this rejected" context.
  autoRejected?: {
    reason: "offer_expired" | "committed_elsewhere";
    at: Date;
  };

  // When this COMMITTED application replaced a prior acceptance on another
  // team (waitlist-promotion reneg), the team that was abandoned. Audit only.
  renegedFrom?: string;

  /**
   * Applicant-facing only, computed by sanitizeApplicationForApplicant and
   * never stored: false once the application is under review, i.e. the real
   * status is past `submitted` even though the applicant still sees
   * "Submitted". The form uses it to go read-only instead of failing to save.
   */
  editable?: boolean;
}

export interface ApplicationCreateData {
  userId: string;
  userName?: string;
  userEmail?: string;
  team: Team;
}
