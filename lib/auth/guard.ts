import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { UserRole } from "@/lib/models/User";

export async function requireAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    throw new Error("Unauthorized");
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    if (userData?.role !== UserRole.ADMIN) {
      throw new Error("Forbidden: Admin access required");
    }

    return { uid, user: userData };
  } catch (error) {
    console.error("Admin auth check failed:", error);
    throw new Error(error instanceof Error ? error.message : "Unauthorized");
  }
}

export async function requireStaff() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    throw new Error("Unauthorized");
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    const allowedRoles = [
      UserRole.ADMIN,
      UserRole.TEAM_CAPTAIN_OB,
      UserRole.SYSTEM_LEAD,
      UserRole.REVIEWER
    ];

    if (!allowedRoles.includes(userData?.role)) {
      throw new Error("Forbidden: Staff access required");
    }

    return { uid, user: userData };
  } catch (error) {
    console.error("Staff auth check failed:", error);
    throw new Error(error instanceof Error ? error.message : "Unauthorized");
  }
}
