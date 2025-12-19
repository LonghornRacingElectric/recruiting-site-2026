import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import {
  getAllApplications,
  getSystemApplications,
  getTeamApplications,
} from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { UserRole } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireStaff();

    // Determine what applications to return based on role
    let applications = [];

    switch (user.role) {
      case UserRole.ADMIN:
        // Admins see everything
        applications = await getAllApplications();
        break;

      case UserRole.TEAM_CAPTAIN_OB:
        // Team Captains see their team's applications
        if (!user.memberProfile?.team) {
           // Fallback/Error if profile is incomplete
           return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
        }
        applications = await getTeamApplications(user.memberProfile.team);
        break;

      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        // System Leads and Reviewers see their system's applications
         if (!user.memberProfile?.team || !user.memberProfile?.system) {
           return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        }
        applications = await getSystemApplications(user.memberProfile.team, user.memberProfile.system);
        break;


      default:
        // Applicants or no role shouldn't be here
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Enrich applications with user data
    // optimization: unique userIds to avoid duplicate fetches
    const userIds = Array.from(new Set(applications.map((app) => app.userId)));
    const userMap = new Map();

    await Promise.all(
      userIds.map(async (uid) => {
        const userAppProfile = await getUser(uid);
        if (userAppProfile) {
          userMap.set(uid, userAppProfile);
        }
      })
    );

    const enrichedApplications = applications.map((app) => ({
      ...app,
      user: userMap.get(app.userId) || { name: "Unknown", email: "", role: "applicant" },
    }));

    return NextResponse.json({ applications: enrichedApplications }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch admin applications");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
