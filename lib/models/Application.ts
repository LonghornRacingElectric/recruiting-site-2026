import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "./User";

export enum ApplicationStatus {
  IN_PROGRESS = "in_progress",
  SUBMITTED = "submitted",
  INTERVIEW = "interview",
  TRIAL = "trial",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  WAITLISTED = "waitlisted",
}

// Stage-specific decision tracking
export type StageDecision = 'pending' | 'advanced' | 'rejected' | 'waitlisted';

// Calendar event status tracking
export enum InterviewEventStatus {
  PENDING = "pending",           // Offer extended, not scheduled
  SCHEDULING = "scheduling",     // Reservation in progress (optimistic lock)
  SCHEDULED = "scheduled",       // Calendar event created
  CANCELLED = "cancelled",       // Event cancelled by either party
  COMPLETED = "completed",       // Interview took place
  NO_SHOW = "no_show",           // Applicant didn't show up
}

export interface InterviewOffer {
  system: string;                      // The system offering the interview (e.g., "Electronics")

  // Scheduling status
  status: InterviewEventStatus;

  // Calendar event details (populated after scheduling by backend)
  eventId?: string;                    // Google Calendar event ID
  scheduledAt?: Date;                  // Interview date/time
  scheduledEndAt?: Date;               // Interview end time

  // Tracking timestamps
  createdAt: Date;                     // When offer was created by admin
  scheduledOnDate?: Date;              // When applicant booked
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
  availability?: string;
  resumeUrl?: string;
  graduationYear?: string;
  major?: string;
  // Team-specific question answers, keyed by question ID
  teamQuestions?: Record<string, string>;
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
  
  status: ApplicationStatus;
  
  // Stage-specific decisions (visible to user at next recruiting step)
  reviewDecision?: StageDecision;      // Decision from review stage
  interviewDecision?: StageDecision;   // Decision from interview stage  
  trialDecision?: StageDecision;       // Decision from trial stage
  
  // Track which release day the trial decision was made (1, 2, or 3)
  // Decision is only visible to applicant on or after this day
  trialDecisionDay?: 1 | 2 | 3;

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
}

export interface ApplicationCreateData {
  userId: string;
  userName?: string;
  userEmail?: string;
  team: Team;
}
