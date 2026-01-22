export enum RecruitingStep {
  OPEN = "open",
  REVIEWING = "reviewing",
  RELEASE_INTERVIEWS = "release_interviews",
  INTERVIEWING = "interviewing",
  RELEASE_TRIAL = "release_trial",
  TRIAL_WORKDAY = "trial_workday",
  RELEASE_DECISIONS_DAY1 = "release_decisions_day1",
  RELEASE_DECISIONS_DAY2 = "release_decisions_day2",
  RELEASE_DECISIONS_DAY3 = "release_decisions_day3",
}

export interface Announcement {
  message: string;
  enabled: boolean;
  updatedAt: Date;
  updatedBy: string;
}

export interface RecruitingConfig {
  currentStep: RecruitingStep;
  updatedAt: Date;
  updatedBy: string;
}

// Application Questions Configuration
export interface ApplicationQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required: boolean;
  placeholder?: string;
}

export interface ApplicationQuestionsConfig {
  commonQuestions: ApplicationQuestion[];
  teamQuestions: Record<string, ApplicationQuestion[]>; // Keyed by Team enum value
  systemQuestions?: Record<string, ApplicationQuestion[]>; // Optional system-specific questions
  updatedAt: Date;
  updatedBy: string;
}

// Team Descriptions for About Page
export interface SubsystemDescription {
  name: string;
  description: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface TeamDescription {
  name: string;
  description: string;
  rejectionMessage?: string; // Custom rejection message shown to applicants rejected from this team
  subsystems: SubsystemDescription[];
  updatedAt: Date;
  updatedBy: string;
}

export interface TeamsConfig {
  teams: Record<string, TeamDescription>; // Keyed by Team enum value
  updatedAt: Date;
  updatedBy: string;
}

// About Page Configuration (Admin only)
export interface AboutPageConfig {
  title: string;
  subtitle: string;
  missionStatement: string;
  sections: AboutSection[];
  updatedAt: Date;
  updatedBy: string;
}

export interface AboutSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

// Dashboard Configuration (Admin only)
export interface DashboardDeadline {
  id: string;
  title: string;
  date: string; // ISO date string
  description?: string;
  autoFromStep?: RecruitingStep; // If set, date auto-updates based on step
}

export interface DashboardResource {
  id: string;
  title: string;
  url: string;
  description?: string;
}

export interface DashboardConfig {
  deadlines: DashboardDeadline[];
  resources: DashboardResource[];
  updatedAt: Date;
  updatedBy: string;
}
