import { adminDb } from "./admin";
import { RecruitingConfig, RecruitingStep, Announcement, ApplicationQuestionsConfig, ApplicationQuestion, TeamsConfig, TeamDescription, SubsystemDescription, AboutPageConfig, AboutSection, DashboardConfig, DashboardDeadline, DashboardResource } from "@/lib/models/Config";
import { COMMON_QUESTIONS, TEAM_QUESTIONS } from "@/lib/models/teamQuestions";
import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";

const CONFIG_COLLECTION = "config";
const RECRUITING_DOC = "recruiting";
const ANNOUNCEMENT_DOC = "announcement";
const QUESTIONS_DOC = "application_questions";
const TEAMS_DOC = "teams";
const ABOUT_DOC = "about_page";
const DASHBOARD_DOC = "dashboard";

export async function getRecruitingConfig(): Promise<RecruitingConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).get();

  if (doc.exists) {
    const data = doc.data();
    return {
      currentStep: data?.currentStep || RecruitingStep.OPEN,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  // Default config if none exists
  return {
    currentStep: RecruitingStep.OPEN,
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

export async function updateRecruitingStep(step: RecruitingStep, adminId: string): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).set({
    currentStep: step,
    updatedAt: new Date(),
    updatedBy: adminId,
  }, { merge: true });
}

export async function getAnnouncement(): Promise<Announcement | null> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(ANNOUNCEMENT_DOC).get();

  if (doc.exists) {
    const data = doc.data();
    return {
      message: data?.message || "",
      enabled: data?.enabled || false,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return null;
}

export async function updateAnnouncement(message: string, enabled: boolean, adminId: string): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(ANNOUNCEMENT_DOC).set({
    message,
    enabled,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

// Application Questions Functions

/**
 * Get application questions config from Firestore, falling back to hardcoded defaults
 */
export async function getApplicationQuestions(): Promise<ApplicationQuestionsConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).get();

  if (doc.exists) {
    const data = doc.data();
    return {
      commonQuestions: data?.commonQuestions || [],
      teamQuestions: data?.teamQuestions || {},
      systemQuestions: data?.systemQuestions,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  // Return hardcoded defaults if no Firestore config exists
  return getDefaultApplicationQuestions();
}

/**
 * Get hardcoded default questions from teamQuestions.ts
 */
export function getDefaultApplicationQuestions(): ApplicationQuestionsConfig {
  const teamQuestionsRecord: Record<string, ApplicationQuestion[]> = {};

  Object.values(Team).forEach((team) => {
    teamQuestionsRecord[team] = TEAM_QUESTIONS[team] || [];
  });

  return {
    commonQuestions: COMMON_QUESTIONS,
    teamQuestions: teamQuestionsRecord,
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

/**
 * Update the entire application questions config (admin only)
 */
export async function updateApplicationQuestions(
  config: Omit<ApplicationQuestionsConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

/**
 * Update questions for a specific team
 */
export async function updateTeamQuestions(
  team: Team,
  questions: ApplicationQuestion[],
  adminId: string
): Promise<void> {
  const currentConfig = await getApplicationQuestions();

  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set({
    ...currentConfig,
    teamQuestions: {
      ...currentConfig.teamQuestions,
      [team]: questions,
    },
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

/**
 * Update common questions (shared across all applications)
 */
export async function updateCommonQuestions(
  questions: ApplicationQuestion[],
  adminId: string
): Promise<void> {
  const currentConfig = await getApplicationQuestions();

  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set({
    ...currentConfig,
    commonQuestions: questions,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

/**
 * Update questions for a specific system (optional feature)
 */
export async function updateSystemQuestions(
  system: string,
  questions: ApplicationQuestion[],
  adminId: string
): Promise<void> {
  const currentConfig = await getApplicationQuestions();

  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set({
    ...currentConfig,
    systemQuestions: {
      ...currentConfig.systemQuestions,
      [system]: questions,
    },
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

// Team Descriptions Functions

/**
 * Get the subsystems for a given team
 */
function getSubsystemsForTeam(team: Team): string[] {
  switch (team) {
    case Team.ELECTRIC:
      return Object.values(ElectricSystem);
    case Team.SOLAR:
      return Object.values(SolarSystem);
    case Team.COMBUSTION:
      return Object.values(CombustionSystem);
    default:
      return [];
  }
}

/**
 * Get default team descriptions based on the system enums
 */
export function getDefaultTeamsConfig(): TeamsConfig {
  const now = new Date();
  const teams: Record<string, TeamDescription> = {};

  Object.values(Team).forEach((team) => {
    const subsystems = getSubsystemsForTeam(team);
    teams[team] = {
      name: team,
      description: `${team} team description. Update this in the admin panel.`,
      subsystems: subsystems.map((subsystem) => ({
        name: subsystem,
        description: `${subsystem} subsystem description. Update this in the admin panel.`,
        updatedAt: now,
        updatedBy: "system",
      })),
      updatedAt: now,
      updatedBy: "system",
    };
  });

  return {
    teams,
    updatedAt: now,
    updatedBy: "system",
  };
}

/**
 * Get teams config from Firestore, falling back to defaults
 */
export async function getTeamsConfig(): Promise<TeamsConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).get();

  if (doc.exists) {
    const data = doc.data();

    // Parse teams data and convert Firestore timestamps
    const teams: Record<string, TeamDescription> = {};
    if (data?.teams) {
      Object.entries(data.teams).forEach(([teamKey, teamData]) => {
        const team = teamData as Record<string, unknown>;
        teams[teamKey] = {
          name: team.name as string,
          description: team.description as string,
          subsystems: ((team.subsystems as Array<Record<string, unknown>>) || []).map((sub) => ({
            name: sub.name as string,
            description: sub.description as string,
            updatedAt: (sub.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
            updatedBy: sub.updatedBy as string,
          })),
          updatedAt: (team.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
          updatedBy: team.updatedBy as string,
        };
      });
    }

    return {
      teams,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return getDefaultTeamsConfig();
}

/**
 * Update a team's description (Team Captain access)
 */
export async function updateTeamDescription(
  team: Team,
  description: string,
  userId: string
): Promise<void> {
  const currentConfig = await getTeamsConfig();
  const now = new Date();

  const updatedTeam = {
    ...currentConfig.teams[team],
    description,
    updatedAt: now,
    updatedBy: userId,
  };

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });
}

/**
 * Update a team's rejection message (Team Captain access)
 */
export async function updateTeamRejectionMessage(
  team: Team,
  rejectionMessage: string,
  userId: string
): Promise<void> {
  const currentConfig = await getTeamsConfig();
  const now = new Date();

  const updatedTeam = {
    ...currentConfig.teams[team],
    rejectionMessage,
    updatedAt: now,
    updatedBy: userId,
  };

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });
}

/**
 * Update a subsystem's description (System Lead access)
 */
export async function updateSubsystemDescription(
  team: Team,
  subsystemName: string,
  description: string,
  userId: string
): Promise<void> {
  const currentConfig = await getTeamsConfig();
  const now = new Date();

  const teamConfig = currentConfig.teams[team];
  if (!teamConfig) {
    throw new Error(`Team ${team} not found`);
  }

  const subsystemIndex = teamConfig.subsystems.findIndex(s => s.name === subsystemName);
  if (subsystemIndex === -1) {
    throw new Error(`Subsystem ${subsystemName} not found in team ${team}`);
  }

  const updatedSubsystems = [...teamConfig.subsystems];
  updatedSubsystems[subsystemIndex] = {
    ...updatedSubsystems[subsystemIndex],
    description,
    updatedAt: now,
    updatedBy: userId,
  };

  const updatedTeam = {
    ...teamConfig,
    subsystems: updatedSubsystems,
    updatedAt: now,
    updatedBy: userId,
  };

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });
}

// About Page Functions

/**
 * Get default about page config
 */
export function getDefaultAboutPageConfig(): AboutPageConfig {
  const now = new Date();
  return {
    title: "About Longhorn Racing",
    subtitle: "Engineering Excellence Since 1999",
    missionStatement: "Longhorn Racing is The University of Texas at Austin's premier student-run motorsports organization. We design, build, and race high-performance vehicles while providing students with hands-on engineering experience and professional development opportunities.",
    sections: [
      {
        id: "history",
        title: "Our History",
        content: "Founded in 1999, Longhorn Racing has grown from a small group of passionate engineering students into one of the most successful collegiate motorsports programs in the nation. Our teams consistently compete at the highest levels in Formula SAE and other competitions worldwide.",
        order: 1,
      },
      {
        id: "values",
        title: "Our Values",
        content: "We believe in hands-on learning, collaborative problem-solving, and pushing the boundaries of what's possible. Our members gain real-world experience in engineering design, manufacturing, project management, and teamwork.",
        order: 2,
      },
    ],
    updatedAt: now,
    updatedBy: "system",
  };
}

/**
 * Get about page config from Firestore
 */
export async function getAboutPageConfig(): Promise<AboutPageConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(ABOUT_DOC).get();

  if (doc.exists) {
    const data = doc.data();
    return {
      title: data?.title || "About Longhorn Racing",
      subtitle: data?.subtitle || "",
      missionStatement: data?.missionStatement || "",
      sections: (data?.sections || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        title: s.title as string,
        content: s.content as string,
        order: s.order as number,
      })).sort((a: AboutSection, b: AboutSection) => a.order - b.order),
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return getDefaultAboutPageConfig();
}

/**
 * Update about page config (Admin only)
 */
export async function updateAboutPageConfig(
  config: Omit<AboutPageConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(ABOUT_DOC).set({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

// Dashboard Config Functions

/**
 * Get default dashboard config
 */
export function getDefaultDashboardConfig(): DashboardConfig {
  return {
    deadlines: [],
    resources: [],
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

/**
 * Get dashboard config from Firestore
 */
export async function getDashboardConfig(): Promise<DashboardConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(DASHBOARD_DOC).get();

  if (doc.exists) {
    const data = doc.data();
    return {
      deadlines: (data?.deadlines || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        title: d.title as string,
        date: d.date as string,
        description: d.description as string | undefined,
        autoFromStep: d.autoFromStep as RecruitingStep | undefined,
      })),
      resources: (data?.resources || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        url: r.url as string,
        description: r.description as string | undefined,
      })),
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return getDefaultDashboardConfig();
}

/**
 * Update dashboard config (Admin only)
 */
export async function updateDashboardConfig(
  config: Omit<DashboardConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(DASHBOARD_DOC).set({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}
