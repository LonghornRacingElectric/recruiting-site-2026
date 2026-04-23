import { adminDb } from "./admin";
import { ScorecardConfig, ScorecardFieldConfig, ScorecardType } from "@/lib/models/Scorecard";
import { Team, User, UserRole } from "@/lib/models/User";
import { slugifySystem } from "./utils";

const CONFIG_COLLECTION = "scorecardConfigs";
const USERS_COLLECTION = "users";

/**
 * Generate a deterministic document ID for a scorecard config.
 * Format: {team}-{system}-{type} (all lowercase, spaces/slashes replaced with hyphens)
 * For backward compatibility, "application" type omits the suffix.
 */
export function generateScorecardConfigId(team: Team, system: string, type: ScorecardType = "application"): string {
  const teamSlug = team.toLowerCase().replace(/\s+/g, '-');
  const systemSlug = slugifySystem(system);
  const base = `${teamSlug}-${systemSlug}`;
  return type === "interview" ? `${base}-interview` : base;
}

/**
 * Helper to convert Firestore data to ScorecardConfig.
 */
const toConfig = (doc: FirebaseFirestore.DocumentSnapshot): ScorecardConfig | null => {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    team: data?.team,
    system: data?.system,
    scorecardType: data?.scorecardType || "application",
    fields: data?.fields || [],
    createdAt: data?.createdAt?.toDate(),
    updatedAt: data?.updatedAt?.toDate(),
    createdBy: data?.createdBy,
  } as ScorecardConfig;
};

/**
 * Fetch all scorecard configs, optionally filtered by team and type.
 */
export async function getScorecardConfigs(team?: Team, type: ScorecardType = "application"): Promise<ScorecardConfig[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(CONFIG_COLLECTION);
  
  if (team) {
    query = query.where("team", "==", team);
  }
  
  // Filter by type - for backward compatibility, configs without type are "application"
  query = query.where("scorecardType", "==", type);
  
  const snapshot = await query.get();
  
  // Also include legacy configs without scorecardType for application type
  if (type === "application") {
    const legacyQuery = team 
      ? adminDb.collection(CONFIG_COLLECTION).where("team", "==", team)
      : adminDb.collection(CONFIG_COLLECTION);
    const legacySnapshot = await legacyQuery.get();
    const legacyConfigs = legacySnapshot.docs
      .map(toConfig)
      .filter((c): c is ScorecardConfig => c !== null && !c.scorecardType);
    
    const typedConfigs = snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
    
    // Merge and deduplicate by id
    const allConfigs = [...typedConfigs, ...legacyConfigs];
    const seen = new Set<string>();
    return allConfigs.filter(c => {
      if (c.id && seen.has(c.id)) return false;
      if (c.id) seen.add(c.id);
      return true;
    });
  }
  
  return snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
}

/**
 * Fetch a specific scorecard config by team, system, and type.
 */
export async function getScorecardConfig(team: Team, system: string, type: ScorecardType = "application"): Promise<ScorecardConfig | null> {
  const docId = generateScorecardConfigId(team, system, type);
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(docId).get();
  return toConfig(doc);
}

/**
 * Fetch a specific scorecard config by document ID.
 */
export async function getScorecardConfigById(id: string): Promise<ScorecardConfig | null> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(id).get();
  return toConfig(doc);
}

/**
 * Fetch all scorecard configs a user is authorized to view/edit.
 * - Admin: sees all configs
 * - Team Captain/OB: sees all configs for their team
 * - System Lead: sees only their system's config
 * - Reviewer: sees only their system's config
 * 
 * @param type - Filter by scorecard type ("application" or "interview")
 */
export async function getScorecardConfigsForUser(userUid: string, type?: ScorecardType): Promise<ScorecardConfig[]> {
  const userDoc = await adminDb.collection(USERS_COLLECTION).doc(userUid).get();
  if (!userDoc.exists) return [];

  const user = userDoc.data() as User;
  
  // Helper to filter configs by type
  const filterByType = (configs: ScorecardConfig[]): ScorecardConfig[] => {
    if (!type) return configs;
    return configs.filter(c => {
      const configType = c.scorecardType || "application";
      return configType === type;
    });
  };

  // Admin sees everything
  if (user.role === UserRole.ADMIN) {
    const snapshot = await adminDb.collection(CONFIG_COLLECTION).get();
    const all = snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
    return filterByType(all);
  }

  // Team Captain sees everything for their team
  if (user.role === UserRole.TEAM_CAPTAIN_OB && user.memberProfile?.team) {
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .get();
    const all = snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
    return filterByType(all);
  }

  // System Lead and Reviewer see only their system
  if ((user.role === UserRole.SYSTEM_LEAD || user.role === UserRole.REVIEWER) && 
      user.memberProfile?.team && user.memberProfile?.system) {
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .where("system", "==", user.memberProfile.system)
      .get();
    const all = snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
    return filterByType(all);
  }

  return [];
}

/**
 * Check if a user can modify a specific scorecard config.
 * - Admin: can modify any config
 * - Team Captain/OB: can modify configs for their team
 * - System Lead: can modify only their system's config
 */
export async function canUserModifyConfig(userUid: string, configTeam: Team, configSystem: string): Promise<boolean> {
  const userDoc = await adminDb.collection(USERS_COLLECTION).doc(userUid).get();
  if (!userDoc.exists) return false;

  const user = userDoc.data() as User;

  // Admin can modify anything
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  // Team Captain can modify any config for their team
  if (user.role === UserRole.TEAM_CAPTAIN_OB && user.memberProfile?.team === configTeam) {
    return true;
  }

  // System Lead can modify only their own system's config
  if (user.role === UserRole.SYSTEM_LEAD && 
      user.memberProfile?.team === configTeam && 
      user.memberProfile?.system === configSystem) {
    return true;
  }

  return false;
}

/**
 * Create a new scorecard configuration.
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function createScorecardConfig(
  config: Omit<ScorecardConfig, 'id' | 'createdAt' | 'updatedAt'>,
  creatorUid: string
): Promise<ScorecardConfig> {
  if (!config.team || !config.system) {
    throw new Error("Team and system are required for scorecard configs");
  }

  const configType: ScorecardType = config.scorecardType || "application";
  const docId = generateScorecardConfigId(config.team, config.system, configType);
  const docRef = adminDb.collection(CONFIG_COLLECTION).doc(docId);

  return await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(docRef);
    
    if (existing.exists) {
      const typeLabel = configType === "interview" ? "Interview scorecard" : "Scorecard";
      throw new Error(`${typeLabel} config for ${config.team} - ${config.system} already exists`);
    }

    const now = new Date();
    const newConfig: ScorecardConfig = {
      ...config,
      id: docId,
      scorecardType: configType,
      createdAt: now,
      updatedAt: now,
      createdBy: creatorUid,
    };

    transaction.set(docRef, newConfig);
    return newConfig;
  });
}

/**
 * Update an existing scorecard configuration.
 */
export async function updateScorecardConfig(
  id: string,
  updates: Partial<Pick<ScorecardConfig, 'fields'>>
): Promise<void> {
  const docRef = adminDb.collection(CONFIG_COLLECTION).doc(id);
  const existing = await docRef.get();
  
  if (!existing.exists) {
    throw new Error("Scorecard config not found");
  }

  await docRef.update({
    ...updates,
    updatedAt: new Date(),
  });
}

/**
 * Delete a scorecard configuration.
 */
export async function deleteScorecardConfig(id: string): Promise<void> {
  const docRef = adminDb.collection(CONFIG_COLLECTION).doc(id);
  const existing = await docRef.get();
  
  if (!existing.exists) {
    throw new Error("Scorecard config not found");
  }

  await docRef.delete();
}
