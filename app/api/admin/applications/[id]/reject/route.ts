import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication, updateApplication } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * POST /api/admin/applications/[id]/reject
 * Reject an applicant from specific systems by removing their interview offers.
 * If no interview offers remain, the application status is set to REJECTED.
 * 
 * Role restrictions:
 * - ADMIN/TEAM_CAPTAIN_OB: Can reject from any system
 * - SYSTEM_LEAD/REVIEWER: Can only reject from their own system
 * 
 * Body: { systems: string[] }
 */
export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    // Get current user for role-based logic
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const currentUser = userDoc.data() as User;

    const body = await request.json();
    let { systems } = body;

    if (!systems || !Array.isArray(systems) || systems.length === 0) {
      return NextResponse.json({ error: "Systems array is required" }, { status: 400 });
    }

    // Role-based restrictions for rejection
    const isHigherAuthority = currentUser.role === UserRole.ADMIN || 
                               currentUser.role === UserRole.TEAM_CAPTAIN_OB;

    if (!isHigherAuthority) {
      // System leads and reviewers can only reject from their own system
      const userSystem = currentUser.memberProfile?.system;
      if (!userSystem) {
        return NextResponse.json({ error: "Your system profile is not configured" }, { status: 403 });
      }
      
      // Filter to only allow rejecting from their own system
      const requestedOwnSystem = systems.filter((s: string) => s === userSystem);
      if (requestedOwnSystem.length === 0) {
        return NextResponse.json({ 
          error: "You can only reject from your own system" 
        }, { status: 403 });
      }
      
      // Override to only reject from their system
      systems = [userSystem];
    }

    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Get existing interview offers
    const existingOffers = application.interviewOffers || [];
    
    // Remove offers for the specified systems
    const remainingOffers = existingOffers.filter(
      offer => !systems.includes(offer.system)
    );

    // Track rejected systems (add to existing list, avoid duplicates)
    const existingRejections = application.rejectedBySystems || [];
    const newRejections = [...new Set([...existingRejections, ...systems])];

    // Determine if application should be marked as REJECTED
    // Only if no offers remain
    const hasActiveOffers = remainingOffers.length > 0;
    
    const updates: Partial<{ interviewOffers: typeof remainingOffers; status: ApplicationStatus; rejectedBySystems: string[] }> = {
      interviewOffers: remainingOffers,
      rejectedBySystems: newRejections,
    };

    // Only set status to REJECTED if no active offers remain
    if (!hasActiveOffers) {
      updates.status = ApplicationStatus.REJECTED;
    }

    const updatedApp = await updateApplication(id, updates);

    return NextResponse.json({ 
      application: updatedApp,
      fullyRejected: !hasActiveOffers 
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to reject application");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
