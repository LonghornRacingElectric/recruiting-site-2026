import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import {
  getAllApplicationsPaginated,
  getSystemApplicationsPaginated,
  getTeamApplicationsPaginated,
  PaginatedApplicationsResult,
} from "@/lib/firebase/applications";
import { adminDb } from "@/lib/firebase/admin";
import { UserRole, Team } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { Application } from "@/lib/models/Application";
import { appCache } from "@/lib/utils/appCache";
import pino from "pino";

const logger = pino();

/**
 * Helper to get recruiting step with 1-minute cache
 */
async function getCachedRecruitingStep(): Promise<RecruitingStep | null> {
  const cached = appCache.getRecruitingStep();
  if (cached !== undefined) return cached;
  
  const doc = await adminDb.collection("config").doc("recruiting").get();
  const step = doc.exists ? (doc.data()?.currentStep as RecruitingStep | null) : null;
  
  appCache.setRecruitingStep(step);
  return step;
}

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
  RecruitingStep.RELEASE_DECISIONS_DAY1,
  RecruitingStep.RELEASE_DECISIONS_DAY2,
  RecruitingStep.RELEASE_DECISIONS_DAY3,
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
 * Batch fetch other team applications for a set of userIds.
 * Returns a map from userId to array of { team, status, preferredSystems }.
 */
async function batchGetOtherTeamApplications(
  userIds: string[],
  currentAppIds: Set<string>
): Promise<Map<string, Array<{ id: string; team: string; status: string; preferredSystems: string[] }>>> {
  const result = new Map<string, Array<{ id: string; team: string; status: string; preferredSystems: string[] }>>();
  if (userIds.length === 0) return result;

  // Firestore 'in' queries support up to 30 values
  const uniqueUserIds = [...new Set(userIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueUserIds.length; i += 30) {
    chunks.push(uniqueUserIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snapshot = await adminDb
      .collection("applications")
      .where("userId", "in", chunk)
      .select("userId", "team", "status", "preferredSystems")
      .get();

    for (const doc of snapshot.docs) {
      // Skip the current application itself
      if (currentAppIds.has(doc.id)) continue;

      const data = doc.data();
      const userId = data.userId as string;
      if (!result.has(userId)) {
        result.set(userId, []);
      }
      result.get(userId)!.push({
        id: doc.id,
        team: data.team,
        status: data.status,
        preferredSystems: data.preferredSystems || [],
      });
    }
  }

  return result;
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

    // Parse parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor") || undefined;
    const page = parseInt(searchParams.get("page") || "0", 10);
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : DEFAULT_PAGE_SIZE;
    const sortBy = (searchParams.get("sortBy") as SortBy) || "date";
    const sortDirection = (searchParams.get("sortDirection") as SortDirection) || "desc";
    const search = searchParams.get("search")?.toLowerCase() || "";
    const fetchAll = searchParams.get("all") === "true";

    // RBAC Context for caching
    const userSystem = user.memberProfile?.system;
    const userTeam = user.memberProfile?.team;
    const cacheKey = `all:${user.role}:${userTeam || 'none'}:${userSystem || 'none'}`;

    // 1. Check Cache for 'fetchAll' requests
    if (fetchAll) {
      const cached = appCache.getApplications(cacheKey);
      if (cached) {
        return NextResponse.json(cached, { status: 200 });
      }
    }

    // Get current recruiting step (cached for 1 min)
    const currentStep = await getCachedRecruitingStep();
    const showInterviewRatings = isRecruitingStepAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS);

    // If fetchAll is true, we ignore pagination and return EVERYTHING for the role
    if (fetchAll) {
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

      // Batch fetch other team applications for all visible users
      const allAppUserIds = allApplications.map(a => a.userId);
      const allCurrentAppIdSet = new Set(allApplications.map(a => a.id));
      const allOtherTeamsMap = await batchGetOtherTeamApplications(allAppUserIds, allCurrentAppIdSet);

      // Enrich applications
      const enrichedApplications = allApplications.map((app) => {
        const targetSystem = userSystem || app.preferredSystems?.[0];
        const systemRatings = targetSystem && app.aggregateRatings 
          ? app.aggregateRatings[targetSystem] 
          : undefined;
        
        return {
          ...app,
          user: { name: app.userName || "Unknown", email: app.userEmail || "", role: "applicant" },
          aggregateRating: systemRatings?.reviewRating ?? null,
          interviewAggregateRating: showInterviewRatings ? (systemRatings?.interviewRating ?? null) : null,
          otherTeams: allOtherTeamsMap.get(app.userId) || [],
        };
      });

      const result = { 
        applications: enrichedApplications,
        nextCursor: null,
        hasMore: false,
        totalCount: enrichedApplications.length,
      };

      // Store in cache
      appCache.setApplications(cacheKey, result);

      return NextResponse.json(result, { status: 200 });
    }

    // --- Non-fetchAll / Paginated Paths (Legacy) ---
    // Note: We don't cache these as they are used less frequently now that the UI loads all.

    // For date sorting without search, use Firestore's native ordering with cursor pagination
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

      const appUserIds = paginatedResult.applications.map(a => a.userId);
      const currentAppIdSet = new Set(paginatedResult.applications.map(a => a.id));
      const otherTeamsMap = await batchGetOtherTeamApplications(appUserIds, currentAppIdSet);

      const enrichedApplications = paginatedResult.applications.map((app) => {
        const targetSystem = userSystem || app.preferredSystems?.[0];
        const systemRatings = targetSystem && app.aggregateRatings 
          ? app.aggregateRatings[targetSystem] 
          : undefined;
        
        return {
          ...app,
          user: { name: app.userName || "Unknown", email: app.userEmail || "", role: "applicant" },
          aggregateRating: systemRatings?.reviewRating ?? null,
          interviewAggregateRating: showInterviewRatings ? (systemRatings?.interviewRating ?? null) : null,
          otherTeams: otherTeamsMap.get(app.userId) || [],
        };
      });

      if (sortDirection === "asc") enrichedApplications.reverse();

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
        if (!userTeam) return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
        allApplications = await getAllApplicationsForRole(UserRole.TEAM_CAPTAIN_OB, userTeam);
        allApplications = allApplications.filter(app => app.status !== "in_progress");
        break;
      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        if (!userTeam || !userSystem) return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        allApplications = await getAllApplicationsForRole(user.role, userTeam, userSystem);
        allApplications = allApplications.filter(app => app.status !== "in_progress");
        break;
      default:
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const allAppUserIds = allApplications.map(a => a.userId);
    const allCurrentAppIdSet = new Set(allApplications.map(a => a.id));
    const allOtherTeamsMap = await batchGetOtherTeamApplications(allAppUserIds, allCurrentAppIdSet);

    const enrichedApplications = allApplications.map((app) => {
      const targetSystem = userSystem || app.preferredSystems?.[0];
      const systemRatings = targetSystem && app.aggregateRatings ? app.aggregateRatings[targetSystem] : undefined;
      return {
        ...app,
        user: { name: app.userName || "Unknown", email: app.userEmail || "", role: "applicant" },
        aggregateRating: systemRatings?.reviewRating ?? null,
        interviewAggregateRating: showInterviewRatings ? (systemRatings?.interviewRating ?? null) : null,
        otherTeams: allOtherTeamsMap.get(app.userId) || [],
      };
    });

    let filteredApplications = enrichedApplications;
    if (search) {
      filteredApplications = enrichedApplications.filter(app => {
        const name = app.user?.name?.toLowerCase() || "";
        const email = app.user?.email?.toLowerCase() || "";
        return name.includes(search) || email.includes(search);
      });
    }

    filteredApplications.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name": comparison = (a.user?.name || "").localeCompare(b.user?.name || ""); break;
        case "rating": comparison = (a.aggregateRating ?? -1) - (b.aggregateRating ?? -1); break;
        case "interviewRating": comparison = (a.interviewAggregateRating ?? -1) - (b.interviewAggregateRating ?? -1); break;
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });

    const startIndex = page * limit;
    const paginatedApps = filteredApplications.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredApplications.length;

    return NextResponse.json({ 
      applications: paginatedApps,
      nextCursor: hasMore ? String(page + 1) : null,
      hasMore,
      totalCount: filteredApplications.length,
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to fetch admin applications");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

