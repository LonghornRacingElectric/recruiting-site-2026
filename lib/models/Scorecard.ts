import { Team } from "./User";

export type ScorecardFieldType = "rating" | "boolean" | "text" | "long_text";

export interface ScorecardFieldConfig {
  id: string;
  label: string;
  type: ScorecardFieldType;
  min?: number; // for rating
  max?: number; // for rating
  weight?: number; // for rating fields, used in weighted statistics calculation
  description?: string;
  required?: boolean;
}

export interface ScorecardConfig {
  id?: string; // Document ID for database-stored configs
  team: Team;
  system?: string; // Optional for legacy configs, required for database-stored configs
  fields: ScorecardFieldConfig[];
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface ScorecardSubmission {
  id: string;
  applicationId: string;
  reviewerId: string;
  reviewerName: string;
  system?: string; // The system this scorecard was submitted for
  data: Record<string, string | number | boolean>;
  submittedAt: Date;
  updatedAt: Date;
}

