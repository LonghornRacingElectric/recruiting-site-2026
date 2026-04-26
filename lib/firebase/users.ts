import { adminDb } from "@/lib/firebase/admin";
import { User } from "@/lib/models/User";

const USERS_COLLECTION = "users";

/**
 * Get a user by their UID
 */
export async function getUser(uid: string): Promise<User | null> {
  const doc = await adminDb.collection(USERS_COLLECTION).doc(uid).get();

  if (!doc.exists) {
    return null;
  }

  // Cast existing data to User interface
  // Note: Firestore timestamps might need conversion if User has Date fields
  // Currently User model mostly has strings/enums, so raw matching should work
  // or we can add safety checks if needed.
  return doc.data() as User;
}

/**
 * Update a user's profile
 */
export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await adminDb.collection(USERS_COLLECTION).doc(uid).update(data);
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
  const snapshot = await adminDb.collection(USERS_COLLECTION).get();
  return snapshot.docs.map((doc) => doc.data() as User);
}

/**
 * Get all system leads for a specific team and system
 */
export async function getSystemLeads(team: string, system: string): Promise<User[]> {
  const snapshot = await adminDb.collection(USERS_COLLECTION)
    .where("role", "==", "system_lead")
    .where("memberProfile.team", "==", team)
    .where("memberProfile.system", "==", system)
    .get();

  return snapshot.docs.map((doc) => doc.data() as User);
}

