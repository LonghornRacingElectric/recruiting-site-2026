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
    
    return NextResponse.json({ user: { uid, ...safeUserData } }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to get current user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
