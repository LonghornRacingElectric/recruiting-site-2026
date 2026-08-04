import { Team } from "./User";

/**
 * Interview signup link configuration for each team/system.
 * Stored in the `interviewConfigs` Firestore collection.
 */
export interface InterviewSlotConfig {
  id: string;                          // Document ID (e.g., "electric-electronics")
  team: Team;
  system: string;                       // System name (e.g., "Electronics")
  signupLink: string;                   // External signup link the system lead manages (e.g. a Google Calendar Appointment Schedule page)
}
