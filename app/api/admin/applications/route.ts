import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import {
  getAllApplicationsPaginated,
  getSystemApplicationsPaginated,
  getTeamApplicationsPaginated,
  PaginatedApplicationsResult,
} from "@/lib/firebase/applications";
import { adminDb } from "@/lib/firebase/admin";
import { getUser } from "@/lib/firebase/users";
import { UserRole, Team } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { Application } from "@/lib/models/Application";
import pino from "pino";

const logger = pino();

// Default page size for pagination
const DEFAULT_PAGE_SIZE = 50;

// Valid sort options
type SortBy = "date" | "name" | "rating" | "interviewRating";
type SortDirection = "asc" | "desc";

// Helper to check if recruiting step is at or past a certain stage
const RECRUITING_STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS,
];

function isRecruitingStepAtOrPast(currentStep: RecruitingStep | null, targetStep: RecruitingStep): boolean {
  if (!currentStep) return false;
  const currentIndex = RECRUITING_STEP_ORDER.indexOf(currentStep);
  const targetIndex = RECRUITING_STEP_ORDER.indexOf(targetStep);
  return currentIndex >= targetIndex;
}

/**
 * Helper to convert Firestore document data to Application
 */
function docToApplication(doc: FirebaseFirestore.DocumentSnapshot): Application {
  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    submittedAt: data.submittedAt?.toDate(),
  } as Application;
}

/**
 * Fetch ALL applications matching role-based filters (no pagination).
 * Used for non-date sorting where we need to sort server-side.
 */
async function getAllApplicationsForRole(
  role: UserRole,
  team?: Team,
  system?: string
): Promise<Application[]> {
  let query: FirebaseFirestore.Query = adminDb.collection("applications");

  switch (role) {
    case UserRole.ADMIN:
      // No filters for admin
      break;
    case UserRole.TEAM_CAPTAIN_OB:
      if (team) {
        query = query.where("team", "==", team);
      }
      break;
    case UserRole.SYSTEM_LEAD:
    case UserRole.REVIEWER:
      if (team && system) {
        query = query
          .where("team", "==", team)
          .where("preferredSystems", "array-contains", system);
      }
      break;
  }

  const snapshot = await query.get();
  return snapshot.docs.map(docToApplication);
}


export async function GET(request: NextRequest) {
  try {
    const { user } = await requireStaff();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse pagination and sorting parameters from query string
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor") || undefined;
    const page = parseInt(searchParams.get("page") || "0", 10);
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : DEFAULT_PAGE_SIZE;
    const sortBy = (searchParams.get("sortBy") as SortBy) || "date";
    const sortDirection = (searchParams.get("sortDirection") as SortDirection) || "desc";
    const search = searchParams.get("search")?.toLowerCase() || "";

    // Get the user's system for rating lookups
    const userSystem = user.memberProfile?.system;
    const userTeam = user.memberProfile?.team;

    // Get current recruiting step to determine if interview ratings should be shown
    const recruitingConfigDoc = await adminDb.collection("config").doc("recruiting").get();
    const currentStep = recruitingConfigDoc.exists 
      ? (recruitingConfigDoc.data()?.currentStep as RecruitingStep | null)
      : null;
    const showInterviewRatings = isRecruitingStepAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS);

    // For date sorting without search, use Firestore's native ordering with cursor pagination
    // When search is present, we need to fetch all and filter (can't search by user name in Firestore)
    if (sortBy === "date" && !search) {
      let paginatedResult: PaginatedApplicationsResult;

      switch (user.role) {
        case UserRole.ADMIN:
          paginatedResult = await getAllApplicationsPaginated(limit, cursor);
          break;
        case UserRole.TEAM_CAPTAIN_OB:
          if (!userTeam) {
            return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
          }
          paginatedResult = await getTeamApplicationsPaginated(userTeam, limit, cursor);
          paginatedResult.applications = paginatedResult.applications.filter(app => app.status !== "in_progress");
          break;
        case UserRole.SYSTEM_LEAD:
        case UserRole.REVIEWER:
          if (!userTeam || !userSystem) {
            return NextResponse.json({ error: "System profile missing" }, { status: 403 });
          }
          paginatedResult = await getSystemApplicationsPaginated(userTeam, userSystem, limit, cursor);
          paginatedResult.applications = paginatedResult.applications.filter(app => app.status !== "in_progress");
          break;
        default:
          return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }

      // Enrich applications with user data
      const userIds = Array.from(new Set(paginatedResult.applications.map((app) => app.userId)));
      const userMap = new Map();
      await Promise.all(
        userIds.map(async (uid) => {
          const userAppProfile = await getUser(uid);
          if (userAppProfile) {
            userMap.set(uid, userAppProfile);
          }
        })
      );

      const enrichedApplications = paginatedResult.applications.map((app) => {
        const targetSystem = userSystem || app.preferredSystems?.[0];
        const systemRatings = targetSystem && app.aggregateRatings 
          ? app.aggregateRatings[targetSystem] 
          : undefined;
        
        return {
          ...app,
          user: userMap.get(app.userId) || { name: "Unknown", email: "", role: "applicant" },
          aggregateRating: systemRatings?.reviewRating ?? null,
          interviewAggregateRating: showInterviewRatings ? (systemRatings?.interviewRating ?? null) : null,
        };
      });

      // Apply sort direction for date (Firestore returns descending by default)
      if (sortDirection === "asc") {
        enrichedApplications.reverse();
      }

      return NextResponse.json({ 
        applications: enrichedApplications,
        nextCursor: paginatedResult.nextCursor,
        hasMore: paginatedResult.hasMore,
      }, { status: 200 });
    }

    // For name/rating sorting OR when search is present: fetch ALL applications, enrich, filter, sort, then paginate
    let allApplications: Application[];

    switch (user.role) {
      case UserRole.ADMIN:
        allApplications = await getAllApplicationsForRole(UserRole.ADMIN);
        break;
      case UserRole.TEAM_CAPTAIN_OB:
        if (!userTeam) {
          return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
        }
        allApplications = await getAllApplicationsForRole(UserRole.TEAM_CAPTAIN_OB, userTeam);
        allApplications = allApplications.filter(app => app.status !== "in_progress");
        break;
      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        if (!userTeam || !userSystem) {
          return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        }
        allApplications = await getAllApplicationsForRole(user.role, userTeam, userSystem);
        allApplications = allApplications.filter(app => app.status !== "in_progress");
        break;
      default:
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Enrich ALL applications with user data
    const userIds = Array.from(new Set(allApplications.map((app) => app.userId)));
    const userMap = new Map();
    await Promise.all(
      userIds.map(async (uid) => {
        const userAppProfile = await getUser(uid);
        if (userAppProfile) {
          userMap.set(uid, userAppProfile);
        }
      })
    );

    const enrichedApplications = allApplications.map((app) => {
      const targetSystem = userSystem || app.preferredSystems?.[0];
      const systemRatings = targetSystem && app.aggregateRatings 
        ? app.aggregateRatings[targetSystem] 
        : undefined;
      
      return {
        ...app,
        user: userMap.get(app.userId) || { name: "Unknown", email: "", role: "applicant" },
        aggregateRating: systemRatings?.reviewRating ?? null,
        interviewAggregateRating: showInterviewRatings ? (systemRatings?.interviewRating ?? null) : null,
      };
    });

    // Apply search filter (by name or email)
    let filteredApplications = enrichedApplications;
    if (search) {
      filteredApplications = enrichedApplications.filter(app => {
        const name = app.user?.name?.toLowerCase() || "";
        const email = app.user?.email?.toLowerCase() || "";
        return name.includes(search) || email.includes(search);
      });
    }

    // Sort server-side based on sortBy
    filteredApplications.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name": {
          const aName = a.user?.name?.toLowerCase() || "";
          const bName = b.user?.name?.toLowerCase() || "";
          comparison = aName.localeCompare(bName);
          break;
        }
        case "rating": {
          const aRating = a.aggregateRating ?? -1;
          const bRating = b.aggregateRating ?? -1;
          comparison = aRating - bRating;
          break;
        }
        case "interviewRating": {
          const aRating = a.interviewAggregateRating ?? -1;
          const bRating = b.interviewAggregateRating ?? -1;
          comparison = aRating - bRating;
          break;
        }
      }
      
      return sortDirection === "desc" ? -comparison : comparison;
    });

    // Apply offset-based pagination for non-date sorts
    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const paginatedApps = filteredApplications.slice(startIndex, endIndex);
    const hasMore = endIndex < filteredApplications.length;

    return NextResponse.json({ 
      applications: paginatedApps,
      nextCursor: hasMore ? String(page + 1) : null, // Use page number as cursor for non-date sorts
      hasMore,
      totalCount: filteredApplications.length, // Include total for UI
    }, { status: 200 });

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

