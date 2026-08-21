import { adminDb } from "./admin";
import { RecruitingConfig, RecruitingStep, Announcement, ApplicationQuestionsConfig, ApplicationQuestion, TeamsConfig, TeamDescription, SubsystemDescription, AboutPageConfig, AboutSection, DashboardConfig, DashboardDeadline, DashboardResource, FaqConfig, FaqItem, ContactPageConfig, ContactChannel } from "@/lib/models/Config";
import { COMMON_QUESTIONS, TEAM_QUESTIONS } from "@/lib/models/teamQuestions";
import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { EmailTemplatesConfig, EmailTemplate, DEFAULT_EMAIL_TEMPLATES } from "@/lib/models/EmailTemplate";

const CONFIG_COLLECTION = "config";
const RECRUITING_DOC = "recruiting";
const ANNOUNCEMENT_DOC = "announcement";
const QUESTIONS_DOC = "application_questions";
const TEAMS_DOC = "teams";
const ABOUT_DOC = "about_page";
const DASHBOARD_DOC = "dashboard";
const EMAIL_TEMPLATES_DOC = "email_templates";
const FAQ_DOC = "faq";
const CONTACT_DOC = "contact_page";

/**
 * Safely parse a date from Firestore (handles Timestamps, strings, Dates, and invalid data)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParseDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try { return value.toDate(); } catch { return new Date(); }
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
}

export async function getRecruitingConfig(): Promise<RecruitingConfig> {
  try {
    const doc = await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).get();

    if (doc.exists) {
      const data = doc.data();
      return {
        // A missing step means the doc predates the cycle — default closed, not open.
        currentStep: data?.currentStep || RecruitingStep.PRE_OPEN,
        renegEnabled: data?.renegEnabled !== false, // default true
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Default config if fetch fails or doc doesn't exist
  }

  return {
    currentStep: RecruitingStep.PRE_OPEN,
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

/**
 * Flip the reneg kill switch (see RecruitingConfig.renegEnabled).
 */
export async function updateRenegEnabled(enabled: boolean, adminId: string): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).set({
    renegEnabled: enabled,
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
      updatedAt: safeParseDate(data?.updatedAt),
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
  try {
    const doc = await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).get();

    if (doc.exists) {
      const data = doc.data();
      return {
        commonQuestions: data?.commonQuestions || [],
        teamQuestions: data?.teamQuestions || {},
        systemQuestions: data?.systemQuestions || {},
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Return hardcoded defaults on fetch error
  }

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
 * Strip undefined values from an object recursively (Firestore does not accept undefined).
 * Preserves Date objects and other non-plain types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = stripUndefined(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Clean question arrays by removing undefined fields
 */
function cleanQuestions(questions: ApplicationQuestion[]): ApplicationQuestion[] {
  return questions.map(q => stripUndefined(q));
}

/**
 * Update the entire application questions config (admin only)
 */
export async function updateApplicationQuestions(
  config: Omit<ApplicationQuestionsConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  const cleanedConfig = {
    commonQuestions: cleanQuestions(config.commonQuestions),
    teamQuestions: Object.fromEntries(
      Object.entries(config.teamQuestions).map(([k, v]) => [k, cleanQuestions(v)])
    ),
    systemQuestions: config.systemQuestions
      ? Object.fromEntries(
        Object.entries(config.systemQuestions).map(([k, v]) => [k, cleanQuestions(v)])
      )
      : {},
  };
  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set({
    ...cleanedConfig,
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

  const data = stripUndefined({
    ...currentConfig,
    teamQuestions: {
      ...currentConfig.teamQuestions,
      [team]: cleanQuestions(questions),
    },
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set(data);
}

/**
 * Update common questions (shared across all applications)
 */
export async function updateCommonQuestions(
  questions: ApplicationQuestion[],
  adminId: string
): Promise<void> {
  const currentConfig = await getApplicationQuestions();

  const data = stripUndefined({
    ...currentConfig,
    commonQuestions: cleanQuestions(questions),
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set(data);
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

  const data = stripUndefined({
    ...currentConfig,
    systemQuestions: {
      ...(currentConfig.systemQuestions || {}),
      [system]: cleanQuestions(questions),
    },
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(QUESTIONS_DOC).set(data);
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
 * Get teams config from Firestore, falling back to defaults.
 * Automatically reconciles stored subsystems with the current enum values:
 *  - New subsystems in the enum get added with default descriptions.
 *  - Subsystems removed from the enum are dropped.
 *  - Existing subsystem descriptions are preserved.
 */
export async function getTeamsConfig(): Promise<TeamsConfig> {
  try {
    const doc = await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).get();

    if (doc.exists) {
      const data = doc.data();
      const now = new Date();

      // Parse teams data and convert Firestore timestamps
      const teams: Record<string, TeamDescription> = {};
      if (data?.teams) {
        Object.entries(data.teams).forEach(([teamKey, teamData]) => {
          const team = teamData as Record<string, unknown>;
          const storedSubs = ((team.subsystems as Array<Record<string, unknown>>) || []).map((sub) => ({
            name: sub.name as string,
            description: sub.description as string,
            updatedAt: safeParseDate(sub.updatedAt),
            updatedBy: sub.updatedBy as string,
          }));

          // Reconcile with current enum values
          const canonicalSystems = getSubsystemsForTeam(teamKey as Team);
          const storedByName = new Map(storedSubs.map((s) => [s.name, s]));

          const reconciledSubs: SubsystemDescription[] = canonicalSystems.map((sysName) => {
            const existing = storedByName.get(sysName);
            if (existing) return existing;
            // New subsystem not yet in Firestore — use a default
            return {
              name: sysName,
              description: `${sysName} subsystem description. Update this in the admin panel.`,
              updatedAt: now,
              updatedBy: "system",
            };
          });

          const teamDesc: TeamDescription = {
            name: team.name as string,
            description: team.description as string,
            subsystems: reconciledSubs,
            updatedAt: safeParseDate(team.updatedAt),
            updatedBy: team.updatedBy as string,
          };
          if (team.rejectionMessage !== undefined) {
            teamDesc.rejectionMessage = team.rejectionMessage as string;
          }
          teams[teamKey] = teamDesc;
        });
      }

      return {
        teams,
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Fall back to default config on error
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

  const data = stripUndefined({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set(data);
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

  const data = stripUndefined({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set(data);
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

  const data = stripUndefined({
    ...currentConfig,
    teams: {
      ...currentConfig.teams,
      [team]: updatedTeam,
    },
    updatedAt: now,
    updatedBy: userId,
  });

  await adminDb.collection(CONFIG_COLLECTION).doc(TEAMS_DOC).set(data);
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
  try {
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
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Fall back to default config on error
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
  const data = stripUndefined({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(ABOUT_DOC).set(data);
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
      updatedAt: safeParseDate(data?.updatedAt),
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
  const data = stripUndefined({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(DASHBOARD_DOC).set(data);
}

// FAQ Functions

/**
 * Seed FAQ content. Only used when config/faq doesn't exist yet — once an
 * admin saves from the FAQ tab, the stored doc wins.
 */
export function getDefaultFaqConfig(): FaqConfig {
  return {
    items: [
      {
        id: "faq_driving",
        question: "Who gets to drive?",
        answer:
          "Members of each team get the chance to drive, and each team hosts rounds of driver tryouts to select the most dedicated and skilled drivers.",
      },
      {
        id: "faq_time_commitment",
        question: "What is the expected time commitment?",
        answer:
          "The baseline commitment of LHR is mandatory workdays and weekly system meetings. However, members who spend additional time on LHR outside of mandatory times often learn more and have a better experience.",
      },
      {
        id: "faq_non_engineering",
        question: "Can I apply even if I'm not an Engineering major?",
        answer:
          "Yes! We value an applicant's motivation and desire to learn, not just technical skill.",
      },
      {
        id: "faq_prior_experience",
        question: "Do I need prior experience or skills?",
        answer:
          "Nope! We value an applicant's drive to learn and grow over technical experience. Lots of our members come into LHR with no technical experience and leave LHR as talented engineers.",
      },
      {
        id: "faq_interview_questions",
        question: "What is asked in interviews?",
        answer:
          "It depends. Each system/team's interview questions vary and are typically a mix of technical questions and questions to see if an applicant is a good fit for the system.",
      },
      {
        id: "faq_resume_no_experience",
        question: "What should I put on my resume if I have no experience?",
        answer:
          "Tell us what took up most of your time in high school, sports/performing arts/other extracurriculars are important to us and show that you're an applicant dedicated to what you do.",
      },
      {
        id: "faq_interviewer_criteria",
        question: "What are interviewers looking for besides technical skill?",
        answer:
          "We look for dedication, interest in the system/team the applicant is applying to, and drive to learn.",
      },
      {
        id: "faq_multiple_teams",
        question: "Can I join multiple teams/systems?",
        answer:
          "Each applicant will be admitted into 1 team and 1 system. Applicants are eligible for 1 interview per team and 1 trial workday per team. At the end of the application cycle, applicants pick 1 system to join.",
      },
      {
        id: "faq_grade_level",
        question: "Can I apply as a sophomore/junior?",
        answer:
          "Absolutely! We review all applications regardless of grade level.",
      },
    ],
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

/**
 * Get FAQ config from Firestore
 */
export async function getFaqConfig(): Promise<FaqConfig> {
  try {
    const doc = await adminDb.collection(CONFIG_COLLECTION).doc(FAQ_DOC).get();

    if (doc.exists) {
      const data = doc.data();
      return {
        items: (data?.items || []).map((i: Record<string, unknown>) => ({
          id: i.id as string,
          question: i.question as string,
          answer: i.answer as string,
        })),
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Fall back to default config on error
  }

  return getDefaultFaqConfig();
}

/**
 * Update FAQ config (Admin only). Array order is display order.
 */
export async function updateFaqConfig(
  items: FaqItem[],
  adminId: string
): Promise<void> {
  const data = stripUndefined({
    items,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(FAQ_DOC).set(data);
}

// Contact Page Functions

/**
 * Seed contact content — live behavior until an admin saves from the Contact
 * tab, since config/contact_page starts out not existing. Content per PM
 * (2026-08-04): recruiting email, Instagram only (no LinkedIn), no
 * rolling-admissions claims.
 */
export function getDefaultContactPageConfig(): ContactPageConfig {
  return {
    intro:
      "Have questions about Longhorn Racing or the recruiting process? Reach out to us through any of the channels below.",
    email: "longhornracingrecruitment@gmail.com",
    emailDescription: "Contact with any questions about the recruiting process.",
    channels: [
      {
        id: "instagram",
        name: "Instagram",
        handle: "@longhornracing",
        url: "https://www.instagram.com/longhornracing/",
        description: "Follow for live updates on all recruiting events.",
      },
    ],
    ctaHeading: "Start your application today.",
    ctaText: "Don't wait until the deadline — apply now and take the first step.",
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

/**
 * Get contact page config from Firestore
 */
export async function getContactPageConfig(): Promise<ContactPageConfig> {
  try {
    const doc = await adminDb.collection(CONFIG_COLLECTION).doc(CONTACT_DOC).get();

    if (doc.exists) {
      const data = doc.data();
      return {
        intro: data?.intro || "",
        email: data?.email || "",
        emailDescription: data?.emailDescription || "",
        channels: (data?.channels || []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          handle: c.handle as string,
          url: c.url as string,
          description: c.description as string,
        })),
        ctaHeading: data?.ctaHeading || "",
        ctaText: data?.ctaText || "",
        updatedAt: safeParseDate(data?.updatedAt),
        updatedBy: data?.updatedBy || "system",
      };
    }
  } catch {
    // Fall back to default config on error
  }

  return getDefaultContactPageConfig();
}

/**
 * Update contact page config (Admin only)
 */
export async function updateContactPageConfig(
  config: Omit<ContactPageConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  const data = stripUndefined({
    ...config,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
  await adminDb.collection(CONFIG_COLLECTION).doc(CONTACT_DOC).set(data);
}

// Email Templates Functions

/**
 * Get default email templates config from hardcoded defaults
 */
export function getDefaultEmailTemplatesConfig(): EmailTemplatesConfig {
  const now = new Date();
  const sharedSet = (): EmailTemplate[] =>
    DEFAULT_EMAIL_TEMPLATES.map((t) => ({
      ...t,
      updatedAt: now,
      updatedBy: "system",
    }));
  return {
    teams: Object.fromEntries(Object.values(Team).map((team) => [team, sharedSet()])),
    globalEnabled: true,
    updatedAt: now,
    updatedBy: "system",
  };
}

/**
 * Get email templates config from Firestore, falling back to defaults
 */
export async function getEmailTemplatesConfig(): Promise<EmailTemplatesConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(EMAIL_TEMPLATES_DOC).get();

  if (doc.exists) {
    const data = doc.data();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseTemplates = (raw: any[]): EmailTemplate[] =>
      (raw || []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        trigger: t.trigger as EmailTemplate["trigger"],
        name: t.name as string,
        subject: t.subject as string,
        body: t.body as string,
        enabled: t.enabled as boolean,
        updatedAt: safeParseDate(t.updatedAt),
        updatedBy: t.updatedBy as string,
      }));

    let teams: Record<string, EmailTemplate[]>;
    if (data?.teams) {
      teams = Object.fromEntries(
        Object.values(Team).map((team) => [team, parseTemplates(data.teams[team])])
      );
    } else {
      // Legacy flat shape: one shared template set. Expand to all three teams
      // so each can be customized independently; the next admin save persists
      // the per-team shape.
      const shared = parseTemplates(data?.templates);
      teams = Object.fromEntries(
        Object.values(Team).map((team) => [team, shared.map((t) => ({ ...t }))])
      );
    }

    return {
      teams,
      globalEnabled: data?.globalEnabled !== false, // Default to true
      updatedAt: safeParseDate(data?.updatedAt),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return getDefaultEmailTemplatesConfig();
}

/**
 * Update the entire email templates config (Admin only)
 */
export async function updateEmailTemplatesConfig(
  config: Omit<EmailTemplatesConfig, "updatedAt" | "updatedBy">,
  adminId: string
): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(EMAIL_TEMPLATES_DOC).set({
    teams: Object.fromEntries(
      Object.entries(config.teams).map(([team, templates]) => [
        team,
        (templates || []).map((t) => stripUndefined(t)),
      ])
    ),
    globalEnabled: config.globalEnabled,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}
