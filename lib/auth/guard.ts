import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { UserRole } from "@/lib/models/User";
import { getApplication } from "@/lib/firebase/applications";
import { Application } from "@/lib/models/Application";
import { redirect } from "next/navigation";

// Error message that indicates the Firebase user record was deleted
const USER_NOT_FOUND_ERROR = "no user record";

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

    // If the Firebase user record was deleted, clear the stale session
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
    if (errorMessage.includes(USER_NOT_FOUND_ERROR)) {
      // Clear cookies and redirect to logout
      const cookieStore = await cookies();
      cookieStore.delete("session");
      cookieStore.delete("user_role");
      redirect("/auth/login");
    }

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

    // If the Firebase user record was deleted, clear the stale session
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
    if (errorMessage.includes(USER_NOT_FOUND_ERROR)) {
      // Clear cookies and redirect to logout
      const cookieStore = await cookies();
      cookieStore.delete("session");
      cookieStore.delete("user_role");
      redirect("/auth/login");
    }

    throw new Error(error instanceof Error ? error.message : "Unauthorized");
  }
}

/**
 * Verify that the authenticated staff user is authorized to access a specific application.
 * - ADMIN: always allowed
 * - TEAM_CAPTAIN_OB: must be on the same team as the application
 * - SYSTEM_LEAD / REVIEWER: must be on the same team AND their system must be in the application's preferredSystems
 * 
 * Returns { uid, user, application } on success, throws on failure.
 */
export async function requireStaffForApplication(applicationId: string) {
  const { uid, user } = await requireStaff();

  const application = await getApplication(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  // Admins can access any application
  if (user?.role === UserRole.ADMIN) {
    return { uid, user, application };
  }

  const userTeam = user?.memberProfile?.team;
  const userSystem = user?.memberProfile?.system;

  // All non-admin staff must be on the same team as the application
  if (!userTeam || userTeam !== application.team) {
    throw new Error("Forbidden: You do not have access to this application");
  }

  // Team captains can access any application on their team
  if (user?.role === UserRole.TEAM_CAPTAIN_OB) {
    return { uid, user, application };
  }

  // System leads and reviewers must also have their system in the application's preferredSystems
  if (user?.role === UserRole.SYSTEM_LEAD || user?.role === UserRole.REVIEWER) {
    const appSystems = application.preferredSystems || [];
    if (!userSystem || !appSystems.includes(userSystem)) {
      throw new Error("Forbidden: You do not have access to this application");
    }
  }

  return { uid, user, application };
}
