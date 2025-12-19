import { adminDb } from "./admin";
import { ScorecardConfig, ScorecardFieldConfig } from "@/lib/models/Scorecard";
import { Team, User, UserRole } from "@/lib/models/User";

const CONFIG_COLLECTION = "scorecardConfigs";
const USERS_COLLECTION = "users";

/**
 * Generate a deterministic document ID for a scorecard config.
 * Format: {team}-{system} (all lowercase, spaces replaced with hyphens)
 */
export function generateScorecardConfigId(team: Team, system: string): string {
  return `${team}-${system}`.toLowerCase().replace(/\s+/g, '-');
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
    fields: data?.fields || [],
    createdAt: data?.createdAt?.toDate(),
    updatedAt: data?.updatedAt?.toDate(),
    createdBy: data?.createdBy,
  } as ScorecardConfig;
};

/**
 * Fetch all scorecard configs, optionally filtered by team.
 */
export async function getScorecardConfigs(team?: Team): Promise<ScorecardConfig[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(CONFIG_COLLECTION);
  
  if (team) {
    query = query.where("team", "==", team);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
}

/**
 * Fetch a specific scorecard config by team and system.
 */
export async function getScorecardConfig(team: Team, system: string): Promise<ScorecardConfig | null> {
  const docId = generateScorecardConfigId(team, system);
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
 */
export async function getScorecardConfigsForUser(userUid: string): Promise<ScorecardConfig[]> {
  const userDoc = await adminDb.collection(USERS_COLLECTION).doc(userUid).get();
  if (!userDoc.exists) return [];

  const user = userDoc.data() as User;

  // Admin sees everything
  if (user.role === UserRole.ADMIN) {
    const snapshot = await adminDb.collection(CONFIG_COLLECTION).get();
    return snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
  }

  // Team Captain sees everything for their team
  if (user.role === UserRole.TEAM_CAPTAIN_OB && user.memberProfile?.team) {
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .get();
    return snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
  }

  // System Lead and Reviewer see only their system
  if ((user.role === UserRole.SYSTEM_LEAD || user.role === UserRole.REVIEWER) && 
      user.memberProfile?.team && user.memberProfile?.system) {
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .where("system", "==", user.memberProfile.system)
      .get();
    return snapshot.docs.map(toConfig).filter((c): c is ScorecardConfig => c !== null);
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
 */
export async function createScorecardConfig(
  config: Omit<ScorecardConfig, 'id' | 'createdAt' | 'updatedAt'>,
  creatorUid: string
): Promise<ScorecardConfig> {
  if (!config.team || !config.system) {
    throw new Error("Team and system are required for scorecard configs");
  }

  const docId = generateScorecardConfigId(config.team, config.system);
  const docRef = adminDb.collection(CONFIG_COLLECTION).doc(docId);

  // Check if config already exists
  const existing = await docRef.get();
  if (existing.exists) {
    throw new Error(`Scorecard config for ${config.team} - ${config.system} already exists`);
  }

  const now = new Date();
  const newConfig: ScorecardConfig = {
    ...config,
    id: docId,
    createdAt: now,
    updatedAt: now,
    createdBy: creatorUid,
  };

  await docRef.set(newConfig);
  return newConfig;
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
