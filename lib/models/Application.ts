import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "./User";

export enum ApplicationStatus {
  IN_PROGRESS = "in_progress",
  SUBMITTED = "submitted",
  INTERVIEW = "interview",
  TRIAL = "trial",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

// Calendar event status tracking
export enum InterviewEventStatus {
  PENDING = "pending",           // Offer extended, not scheduled
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
  team: Team;
  
  // Multiple systems the applicant is interested in
  preferredSystems?: (ElectricSystem | SolarSystem | CombustionSystem)[];
  
  /** @deprecated Use preferredSystems instead. Kept for backwards compatibility. */
  preferredSystem?: ElectricSystem | SolarSystem | CombustionSystem;
  
  status: ApplicationStatus;

  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;

  formData: ApplicationFormData;

  // Interview-related fields 
  interviewOffers?: InterviewOffer[];       // Systems offering interviews
  selectedInterviewSystem?: string;         // For Combustion/Electric: chosen system
  
  // Rejection tracking
  rejectedBySystems?: string[];             // Systems that have rejected this applicant
}

export interface ApplicationCreateData {
  userId: string;
  team: Team;
}

