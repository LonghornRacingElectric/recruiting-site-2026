import { NextRequest, NextResponse } from "next/server";
import { requireStaffForApplication } from "@/lib/auth/guard";
import { getUserApplications } from "@/lib/firebase/applications";
import { UserRole } from "@/lib/models/User";
import { ApplicationStatus } from "@/lib/models/Application";
import { logger } from "@/lib/logger";


/**
 * GET /api/admin/applications/[id]/related
 * Fetch other applications submitted by the same user.
 * Returns full data (including id) for admins, limited data for other staff.
 * Enforces team-based authorization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, application } = await requireStaffForApplication(id);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all applications for this user
    const allApplications = await getUserApplications(application.userId);

    // Filter out the current application
    const relatedApplications = allApplications.filter(app => app.id !== id);

    // Determine if user is admin
    const isAdmin = user.role === UserRole.ADMIN;
    const viewerTeam = user.memberProfile?.team;
    const viewerSystem = user.memberProfile?.system;

    // Return role-based data, with per-system rejection detail (#16).
    const responseData = relatedApplications.map(app => {
      // Team-detail visibility: admins and the application's own team's staff
      // (leads/reviewers matched on system) see full detail. Other teams' staff
      // see team-level status only — which systems rejected someone, why an
      // auto-rejection happened, and waitlist state are that team's internal
      // review detail (Q8, and the same principle as the waitlist masking).
      const canSeeTeamDetail =
        isAdmin ||
        (viewerTeam === app.team &&
          (user.role === UserRole.TEAM_CAPTAIN_OB ||
            ((user.role === UserRole.SYSTEM_LEAD || user.role === UserRole.REVIEWER) &&
              !!viewerSystem &&
              (app.preferredSystems || []).includes(viewerSystem))));

      const status =
        app.status === ApplicationStatus.WAITLISTED && !canSeeTeamDetail
          ? "inactive"
          : app.status;

      const base = {
        team: app.team,
        status,
        preferredSystems: app.preferredSystems || [],
        rejectedBySystems: canSeeTeamDetail ? app.rejectedBySystems || [] : [],
        autoRejected: canSeeTeamDetail ? app.autoRejected ?? null : null,
      };

      // Admins additionally get the ID for navigation
      return isAdmin ? { id: app.id, ...base } : base;
    });

    return NextResponse.json({ applications: responseData }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch related applications");

    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }

    if (error instanceof Error && error.message === "Application not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
