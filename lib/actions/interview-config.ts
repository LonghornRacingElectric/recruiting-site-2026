"use server";

import { adminDb } from "@/lib/firebase/admin";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { User, UserRole, Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { FieldValue } from "firebase-admin/firestore";

const CONFIG_COLLECTION = "interviewConfigs";
const USERS_COLLECTION = "users";

// Helper to convert Firestore data to InterviewSlotConfig
const toConfig = (doc: FirebaseFirestore.DocumentSnapshot): InterviewSlotConfig | null => {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
  } as InterviewSlotConfig;
};

/**
 * Fetch a single interview configuration by ID.
 */
export async function getInterviewConfig(systemId: string): Promise<InterviewSlotConfig | null> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(systemId).get();
  return toConfig(doc);
}

/**
 * Fetch all configs a user is authorized to edit.
 */
export async function getInterviewConfigsForUser(userUid: string): Promise<InterviewSlotConfig[]> {
  const userDoc = await adminDb.collection(USERS_COLLECTION).doc(userUid).get();
  if (!userDoc.exists) return [];

  const user = userDoc.data() as User;

  // Admin sees everything
  if (user.role === UserRole.ADMIN) {
    const snapshot = await adminDb.collection(CONFIG_COLLECTION).get();
    return snapshot.docs.map(toConfig).filter((c): c is InterviewSlotConfig => c !== null);
  }

  // Team Captain sees everything for their team
  if (user.role === UserRole.TEAM_CAPTAIN_OB && user.memberProfile?.team) {
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .get();
    return snapshot.docs.map(toConfig).filter((c): c is InterviewSlotConfig => c !== null);
  }

  // System Lead sees only their system
  if (user.role === UserRole.SYSTEM_LEAD && user.memberProfile?.team && user.memberProfile?.system) {
    // Note: We assume the config ID or a field 'system' matches the user's system.
    // The InterviewSlotConfig has a 'system' field.
    const snapshot = await adminDb
      .collection(CONFIG_COLLECTION)
      .where("team", "==", user.memberProfile.team)
      .where("system", "==", user.memberProfile.system)
      .get();
    return snapshot.docs.map(toConfig).filter((c): c is InterviewSlotConfig => c !== null);
  }

  return [];
}

/**
 * Create a new interview configuration.
 */
export async function createInterviewConfig(config: InterviewSlotConfig): Promise<void> {
  // Generate deterministic ID based on team and system
  const docId = `${config.team}-${config.system}`.toLowerCase().replace(/\s+/g, '-');
  const docRef = adminDb.collection(CONFIG_COLLECTION).doc(docId);

  await docRef.set({
    ...config,
    id: docId
  });
}

/**
 * Update an existing interview configuration.
 */
export async function updateInterviewConfig(config: InterviewSlotConfig): Promise<void> {
  if (!config.id) throw new Error("Config ID is required for update");

  await adminDb.collection(CONFIG_COLLECTION).doc(config.id).update({
    ...config,
    // Prevent overwriting ID
  });
}
