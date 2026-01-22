"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { 
  getTeamsConfig, 
  updateTeamDescription,
  updateSubsystemDescription,
  updateTeamRejectionMessage
} from "@/lib/firebase/config";
import { UserRole, Team } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/config/teams
 * Fetch all team descriptions (staff access)
 */
export async function GET() {
  try {
    await requireStaff();
    const config = await getTeamsConfig();
    
    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch teams config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/config/teams
 * Update team/subsystem descriptions with role-based access control
 * 
 * Body parameters:
 * - scope: "team" | "subsystem"
 * - team: Team (required)
 * - subsystem?: string (required if scope is "subsystem")
 * - description: string
 */
export async function PUT(request: NextRequest) {
  try {
    const { uid, user } = await requireStaff();
    
    const body = await request.json();
    const { scope, team, subsystem, description, rejectionMessage } = body;

    // Validate scope
    if (!["team", "subsystem", "rejectionMessage"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope. Must be 'team', 'subsystem', or 'rejectionMessage'" }, { status: 400 });
    }

    // Validate team
    if (!team || !Object.values(Team).includes(team)) {
      return NextResponse.json({ error: "Invalid team" }, { status: 400 });
    }

    // Validate description
    if (typeof description !== "string" || description.trim() === "") {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    // Role-based access control
    const userRole = user?.role as UserRole;
    const userTeam = user?.memberProfile?.team as Team | undefined;
    const userSystem = user?.memberProfile?.system as string | undefined;

    // Admin can update everything
    if (userRole === UserRole.ADMIN) {
      if (scope === "team") {
        await updateTeamDescription(team as Team, description, uid);
      } else if (scope === "subsystem") {
        if (!subsystem) {
          return NextResponse.json({ error: "Subsystem name required" }, { status: 400 });
        }
        await updateSubsystemDescription(team as Team, subsystem, description, uid);
      } else if (scope === "rejectionMessage") {
        await updateTeamRejectionMessage(team as Team, rejectionMessage, uid);
      }
      return NextResponse.json({ success: true });
    }

    // Team Captain can only update their own team's description or rejection message
    if (userRole === UserRole.TEAM_CAPTAIN_OB) {
      if (scope === "team" && team === userTeam) {
        await updateTeamDescription(team as Team, description, uid);
        return NextResponse.json({ success: true });
      }
      if (scope === "rejectionMessage" && team === userTeam) {
        await updateTeamRejectionMessage(team as Team, rejectionMessage, uid);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Forbidden: Can only edit your own team's content" }, { status: 403 });
    }

    // System Lead can only update their own subsystem's description
    if (userRole === UserRole.SYSTEM_LEAD) {
      if (scope === "subsystem" && team === userTeam && subsystem === userSystem) {
        await updateSubsystemDescription(team as Team, subsystem, description, uid);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Forbidden: Can only edit your own subsystem's description" }, { status: 403 });
    }

    // Reviewers cannot edit team descriptions
    return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });

  } catch (error) {
    logger.error(error, "Failed to update team description");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
