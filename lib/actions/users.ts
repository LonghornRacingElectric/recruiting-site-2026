"use server";

import { adminDb } from "@/lib/firebase/admin";
import { User, Team } from "@/lib/models/User";
import { requireStaff } from "@/lib/auth/guard";

const USERS_COLLECTION = "users";

/**
 * Fetch all users who are members of a specific team.
 * Used to populate the "Interviewer" dropdown.
 *
 * SECURITY: This is a server action ("use server"), which Next.js exposes
 * as a publicly-callable RPC endpoint. Always gate it on auth.
 */
export async function getTeamMembers(team: Team): Promise<User[]> {
  await requireStaff();

  const snapshot = await adminDb
    .collection(USERS_COLLECTION)
    .where("memberProfile.team", "==", team)
    .get();

  return snapshot.docs.map((doc) => doc.data() as User);
}
