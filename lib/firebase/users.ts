import { adminDb } from "@/lib/firebase/admin";
import { User } from "@/lib/models/User";

const USERS_COLLECTION = "users";

/**
 * Firestore doc -> User. Converts Timestamp fields to Dates: server components
 * hand User objects straight to client components, and React can serialize a
 * Date across that boundary but not a Firestore Timestamp (class instance).
 * Adding `createdAt` to user docs without this took down every page that
 * passed the user through.
 */
export function toUser(data: FirebaseFirestore.DocumentData): User {
  const { createdAt, ...rest } = data;
  const user = rest as User;
  if (createdAt && typeof createdAt.toDate === "function") user.createdAt = createdAt.toDate();
  else if (createdAt instanceof Date) user.createdAt = createdAt;
  return user;
}

/**
 * Get a user by their UID
 */
export async function getUser(uid: string): Promise<User | null> {
  const doc = await adminDb.collection(USERS_COLLECTION).doc(uid).get();

  if (!doc.exists) {
    return null;
  }

  return toUser(doc.data()!);
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
  return snapshot.docs.map((doc) => toUser(doc.data()));
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

  return snapshot.docs.map((doc) => toUser(doc.data()));
}

