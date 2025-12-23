import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import {
  getAllApplications,
  getSystemApplications,
  getTeamApplications,
} from "@/lib/firebase/applications";
import { adminDb } from "@/lib/firebase/admin";
import { getUser } from "@/lib/firebase/users";
import { getScorecardConfig } from "@/lib/firebase/scorecards";
import { ScorecardSubmission, ScorecardConfig } from "@/lib/models/Scorecard";
import { UserRole, Team } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

import { calculateOverallRating } from "@/lib/scorecards/aggregates";


export async function GET(request: NextRequest) {
  try {
    const { user } = await requireStaff();

    // Determine what applications to return based on role
    let applications = [];

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        // Filter out in_progress applications - non-admins shouldn't see drafts
        applications = applications.filter(app => app.status !== "in_progress");
        break;

      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        // System Leads and Reviewers see their system's applications
         if (!user.memberProfile?.team || !user.memberProfile?.system) {
           return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        }
        applications = await getSystemApplications(user.memberProfile.team, user.memberProfile.system);
        // Filter out in_progress applications - non-admins shouldn't see drafts
        applications = applications.filter(app => app.status !== "in_progress");
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

    // For System Leads and Reviewers, compute aggregate ratings
    // Use a batch approach: fetch all scorecards for the system once, then compute per-app
    let ratingsMap = new Map<string, number | null>();
    
    if ((user.role === UserRole.SYSTEM_LEAD || user.role === UserRole.REVIEWER) && 
        user.memberProfile?.team && user.memberProfile?.system) {
      const userTeam = user.memberProfile.team as Team;
      const userSystem = user.memberProfile.system;
      
      // Get scorecard config for this system
      const config = await getScorecardConfig(userTeam, userSystem);
      
      if (config) {
        // Fetch all scorecard submissions for this system across all applications
        // Use a collection group query if available, or batch the queries
        const applicationIds = applications.map(app => app.id);
        
        // Batch fetch scorecards for all applications in this system
        // We'll query each application's scorecards subcollection
        const scorecardPromises = applicationIds.map(async (appId) => {
          const snapshot = await adminDb
            .collection("applications")
            .doc(appId)
            .collection("scorecards")
            .where("system", "==", userSystem)
            .get();
          
          const submissions: ScorecardSubmission[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              ...data,
              id: doc.id,
              submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
              updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            } as ScorecardSubmission;
          });
          
          return { appId, submissions };
        });
        
        const scorecardResults = await Promise.all(scorecardPromises);
        
        // Compute aggregate rating for each application
        for (const { appId, submissions } of scorecardResults) {
          const rating = calculateOverallRating(submissions, config);
          ratingsMap.set(appId, rating);
        }
      }
    }

    const enrichedApplications = applications.map((app) => ({
      ...app,
      user: userMap.get(app.userId) || { name: "Unknown", email: "", role: "applicant" },
      aggregateRating: ratingsMap.get(app.id) ?? null,
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
