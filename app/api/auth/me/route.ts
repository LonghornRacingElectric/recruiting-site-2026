import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";


/**
 * GET /api/auth/me
 * Get current authenticated user information
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();

    // Remove sensitive fields that shouldn't be exposed to client
    const { blacklisted, ...safeUserData } = userData || {};

    const response = NextResponse.json({ user: { uid, ...safeUserData } }, { status: 200 });

    // The user_role cookie (read by proxy.ts for /admin redirects) is only set
    // at login, so a mid-session promotion leaves it stale and bounces the user
    // off /admin until they re-login. Re-sync it here whenever it drifts from
    // the Firestore role, capped to the session cookie's remaining lifetime so
    // the two expire together.
    const cookieRole = request.cookies.get("user_role")?.value;
    const freshRole = typeof userData?.role === "string" ? userData.role.toLowerCase() : undefined;
    const remainingSeconds = decodedToken.exp - Math.floor(Date.now() / 1000);
    if (freshRole && freshRole !== cookieRole && remainingSeconds > 0) {
      response.cookies.set({
        name: "user_role",
        value: freshRole,
        maxAge: remainingSeconds,
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    logger.error(error, "Failed to get current user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
