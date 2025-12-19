import { Team } from "./User";

/**
 * Interview slot configuration for each team/system.
 * Stored in the `interviewConfigs` Firestore collection.
 */
export interface InterviewSlotConfig {
  id: string;                          // Document ID (e.g., "electric-electronics")
  team: Team;
  system: string;                       // System name (e.g., "Electronics")
  calendarId: string;                   // Google Calendar ID to check availability
  interviewerEmails: string[];          // Default interviewers for this system
  durationMinutes: number;              // Interview duration (e.g., 30, 45, 60)
  bufferMinutes: number;                // Buffer between interviews

  // Availability window
  availableDays: number[];              // 0=Sunday, 1=Monday, etc.
  availableStartHour: number;           // e.g., 9 for 9 AM
  availableEndHour: number;             // e.g., 17 for 5 PM

  // Max concurrent interviews allowed (default: 1)
  maxConcurrentInterviews?: number;

  // Optional: timezone for availability
  timezone?: string;                    // e.g., "America/Chicago"
}

/**
 * Represents an available time slot for scheduling
 */
export interface AvailableSlot {
  start: Date;
  end: Date;
}

/**
 * Request to schedule an interview
 */
export interface ScheduleInterviewRequest {
  applicationId: string;
  system: string;
  slotStart: Date;
  slotEnd: Date;
}

/**
 * Response from scheduling an interview
 */
export interface ScheduleInterviewResponse {
  success: boolean;
  eventId?: string;
  scheduledAt?: Date;
  scheduledEndAt?: Date;
  error?: string;
}
