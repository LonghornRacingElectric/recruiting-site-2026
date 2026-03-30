import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { updateInterviewOfferStatus, getApplication } from "@/lib/firebase/applications";
import { InterviewEventStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import { getUser } from "@/lib/firebase/users";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import pino from "pino";

const logger = pino();

/**
 * PATCH - Update interview offer status (mark as completed, cancelled, no_show)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; system: string }> }
) {
  const { id, system } = await params;
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    // Get current user for role check
    const currentUser = await getUser(uid);
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only staff roles can update interview status
    const staffRoles = [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB, UserRole.SYSTEM_LEAD, UserRole.REVIEWER];
    if (!staffRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Team-based authorization
    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const teamAccessError = checkTeamAccess(currentUser, application);
    if (teamAccessError) {
      return NextResponse.json({ error: teamAccessError }, { status: 403 });
    }

    const body = await request.json();
    const { status, cancelReason } = body;

    // Validate status
    const validStatuses = [
      InterviewEventStatus.COMPLETED,
      InterviewEventStatus.CANCELLED,
      InterviewEventStatus.NO_SHOW,
    ];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        error: "Invalid status. Must be one of: completed, cancelled, no_show"
      }, { status: 400 });
    }

    // Update the interview offer status
    const updatedApp = await updateInterviewOfferStatus(id, decodeURIComponent(system), {
      status,
      cancelReason: status === InterviewEventStatus.CANCELLED ? cancelReason : undefined,
    });

    if (!updatedApp) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json({ application: updatedApp }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to update interview offer status");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
