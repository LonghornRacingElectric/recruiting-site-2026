import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { getApplication, getUserApplications } from "@/lib/firebase/applications";
import { UserRole } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/applications/[id]/related
 * Fetch other applications submitted by the same user.
 * Returns full data (including id) for admins, limited data for other staff.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireStaff();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the current application to get the userId
    const currentApplication = await getApplication(id);
    if (!currentApplication) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Fetch all applications for this user
    const allApplications = await getUserApplications(currentApplication.userId);

    // Filter out the current application
    const relatedApplications = allApplications.filter(app => app.id !== id);

    // Determine if user is admin
    const isAdmin = user.role === UserRole.ADMIN;

    // Return role-based data
    const responseData = relatedApplications.map(app => {
      if (isAdmin) {
        // Admins get full data including ID for navigation
        return {
          id: app.id,
          team: app.team,
          status: app.status,
          preferredSystems: app.preferredSystems || [],
        };
      } else {
        // Non-admins get limited data without ID (no linking)
        return {
          team: app.team,
          status: app.status,
          preferredSystems: app.preferredSystems || [],
        };
      }
    });

    return NextResponse.json({ applications: responseData }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch related applications");
    
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
