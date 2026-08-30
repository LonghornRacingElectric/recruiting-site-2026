import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication, rejectApplicationFromSystems } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { DRAFT_ACTION_ERROR } from "@/lib/auth/teamAccess";
import { validateStaffTransition } from "@/lib/utils/transitions";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { requireStaffForApplication } from "@/lib/auth/guard";
import { UserRole, User } from "@/lib/models/User";
import { logger } from "@/lib/logger";
import { appCache } from "@/lib/utils/appCache";
import { recordAudit, snapshotApplication } from "@/lib/firebase/audit";


/**
 * POST /api/admin/applications/[id]/reject
 * Reject an applicant from specific systems.
 * Interview/trial offers are preserved for history.
 * If all systems with offers have rejected, status is set to REJECTED.
 * 
 * Role restrictions:
 * - ADMIN/TEAM_CAPTAIN_OB: Can reject from any system
 * - SYSTEM_LEAD/REVIEWER: Can only reject from their own system
 * 
 * Team restrictions:
 * - Non-admin users must be on the same team as the application
 * - System leads/reviewers must also have their system in the application's preferredSystems
 * 
 * Body: { systems: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify staff access AND team-based authorization
    const { user: currentUser } = await requireStaffForApplication(id);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Reviewers cannot reject applicants - they can only submit scorecards and notes
    if (currentUser.role === UserRole.REVIEWER) {
      return NextResponse.json({
        error: "Reviewers are not authorized to reject applicants"
      }, { status: 403 });
    }

    // Drafts are not reviewable; see the status route for why this matters.
    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (application.status === ApplicationStatus.IN_PROGRESS) {
      return NextResponse.json({ error: DRAFT_ACTION_ERROR }, { status: 400 });
    }
    const { currentStep } = await getRecruitingConfig();
    const refusal = validateStaffTransition({ from: application.status, to: ApplicationStatus.REJECTED, role: currentUser.role, step: currentStep, perSystemReject: true });
    if (refusal) {
      await recordAudit(request, currentUser, { action: "application.reject", outcome: "refused", applicationId: id, applicantTeam: application.team, detail: refusal.error });
      return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    }

    const body = await request.json();
    let { systems } = body;
    const releaseDay = body.releaseDay === undefined || body.releaseDay === null ? undefined : Number(body.releaseDay);
    if (releaseDay !== undefined && ![1, 2, 3].includes(releaseDay)) {
      return NextResponse.json({ error: "releaseDay must be 1, 2 or 3" }, { status: 400 });
    }

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

    // Atomically reject from the specified systems using a transaction
    const { application: updatedApp, fullyRejected } = await rejectApplicationFromSystems(id, systems, { releaseDay: releaseDay as 1 | 2 | 3 | undefined });

    if (!updatedApp) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    appCache.invalidateApplications();

    await recordAudit(request, currentUser, {
      action: "application.reject",
      applicationId: id,
      applicantTeam: application.team,
      systems,
      before: snapshotApplication(application),
      after: snapshotApplication(updatedApp),
      detail: fullyRejected ? `rejected by ${systems.join(", ")} — now fully rejected` : `rejected by ${systems.join(", ")}`,
    });

    return NextResponse.json({
      application: updatedApp,
      fullyRejected
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to reject application");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error instanceof Error && error.message === "Application not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
