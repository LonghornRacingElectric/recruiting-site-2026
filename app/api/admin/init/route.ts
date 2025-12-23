import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import {
  getAllApplications,
  getSystemApplications,
  getTeamApplications,
} from "@/lib/firebase/applications";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { UserRole } from "@/lib/models/User";
import { adminDb } from "@/lib/firebase/admin";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/init
 * Combined endpoint that returns applications, current user, and recruiting config
 * in a single request to reduce Firestore reads.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, uid } = await requireStaff();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch applications based on user role
    let applications = [];

    switch (user.role) {
      case UserRole.ADMIN:
        applications = await getAllApplications();
        break;

      case UserRole.TEAM_CAPTAIN_OB:
        if (!user.memberProfile?.team) {
          return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
        }
        applications = await getTeamApplications(user.memberProfile.team);
        applications = applications.filter(app => app.status !== "in_progress");
        break;

      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        if (!user.memberProfile?.team || !user.memberProfile?.system) {
          return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        }
        applications = await getSystemApplications(user.memberProfile.team, user.memberProfile.system);
        applications = applications.filter(app => app.status !== "in_progress");
        break;

      default:
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Batch fetch user profiles using getAll()
    const userIds = Array.from(new Set(applications.map((app) => app.userId)));
    
    if (userIds.length > 0) {
      const userRefs = userIds.map(uid => adminDb.collection("users").doc(uid));
      const userDocs = await adminDb.getAll(...userRefs);
      
      const userMap = new Map();
      userDocs.forEach((doc, index) => {
        if (doc.exists) {
          userMap.set(userIds[index], doc.data());
        }
      });

      // Enrich applications with user data
      applications = applications.map((app) => ({
        ...app,
        user: userMap.get(app.userId) || { name: "Unknown", email: "", role: "applicant" },
      }));
    } else {
      applications = applications.map((app) => ({
        ...app,
        user: { name: "Unknown", email: "", role: "applicant" },
      }));
    }

    // Fetch recruiting config
    const config = await getRecruitingConfig();

    return NextResponse.json({
      applications,
      user: { uid, ...user },
      recruitingStep: config?.currentStep || null,
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to fetch admin init data");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
