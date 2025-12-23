import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { getScorecardConfig, getScorecardConfigs } from "@/lib/firebase/scorecards";
import { getScorecardConfig as getHardcodedScorecardConfig } from "@/lib/scorecards/config";
import { ScorecardSubmission, ScorecardConfig, ScorecardFieldConfig } from "@/lib/models/Scorecard";
import { Team, UserRole } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import pino from "pino";

const logger = pino();

interface AggregateScore {
  fieldId: string;
  fieldLabel: string;
  average: number;
  weightedAverage?: number;
  weight?: number;
  count: number;
  min: number;
  max: number;
}

interface AggregateData {
  scores: AggregateScore[];
  totalSubmissions: number;
  overallWeightedAverage?: number;
}

/**
 * Calculate aggregate scores from all submissions for a given config.
 */
function calculateAggregates(
  submissions: ScorecardSubmission[],
  config: ScorecardConfig
): AggregateData {
  const ratingFields = config.fields.filter(f => f.type === "rating");
  
  if (submissions.length === 0 || ratingFields.length === 0) {
    return {
      scores: [],
      totalSubmissions: submissions.length,
    };
  }

  const scores: AggregateScore[] = ratingFields.map(field => {
    const values: number[] = [];
    
    for (const sub of submissions) {
      const value = sub.data[field.id];
      if (typeof value === "number") {
        values.push(value);
      }
    }

    if (values.length === 0) {
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        average: 0,
        count: 0,
        min: field.min || 1,
        max: field.max || 5,
        weight: field.weight,
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      average: Math.round(average * 100) / 100, // Round to 2 decimal places
      weightedAverage: field.weight ? Math.round(average * field.weight * 100) / 100 : undefined,
      weight: field.weight,
      count: values.length,
      min: field.min || 1,
      max: field.max || 5,
    };
  });

  // Calculate overall weighted average if weights are defined
  const weightsTotal = scores.reduce((sum, s) => sum + (s.weight || 0), 0);
  let overallWeightedAverage: number | undefined;
  
  if (weightsTotal > 0) {
    const weightedSum = scores.reduce((sum, s) => {
      if (s.weight && s.count > 0) {
        return sum + (s.average * s.weight);
      }
      return sum;
    }, 0);
    overallWeightedAverage = Math.round((weightedSum / weightsTotal) * 100) / 100;
  }

  return {
    scores,
    totalSubmissions: submissions.length,
    overallWeightedAverage,
  };
}

/**
 * GET /api/admin/applications/[id]/scorecard
 * Fetch scorecard config, user's submission, all submissions, and aggregates.
 * Query params:
 *   - system: Optional system to get config for (for multi-system viewing)
 *   - team: Optional team (skip getApplication if provided)
 *   - preferredSystems: Optional comma-separated list of systems (skip getApplication if provided)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userId = decodedToken.uid;
    const user = await getUser(userId);

    // Verify user has staff-level access
    const staffRoles = [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB, UserRole.SYSTEM_LEAD, UserRole.REVIEWER];
    if (!user || !staffRoles.includes(user.role)) {
      return NextResponse.json({ error: "Forbidden: Staff access required" }, { status: 403 });
    }

    // Get query params - if team is provided, we can skip fetching the application
    const url = new URL(request.url);
    const requestedSystem = url.searchParams.get("system");
    const teamParam = url.searchParams.get("team");
    const preferredSystemsParam = url.searchParams.get("preferredSystems");
    
    // Use query params if provided, otherwise fetch application
    let team: string;
    let preferredSystems: string[];
    
    if (teamParam) {
      // Skip application fetch - use provided data from context
      team = teamParam;
      preferredSystems = preferredSystemsParam ? preferredSystemsParam.split(",") : [];
    } else {
      // Fall back to fetching application
      const application = await getApplication(id);
      if (!application) {
         return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      team = application.team;
      preferredSystems = application.preferredSystems || [];
    }

    // Check if user is privileged (can view multiple systems)
    const isPrivileged = user?.role === UserRole.ADMIN || 
                         user?.role === UserRole.TEAM_CAPTAIN_OB;
    
    // Determine which system to use
    let targetSystem: string | undefined = requestedSystem || undefined;
    if (!targetSystem) {
      // For non-privileged users (reviewers, system leads), default to their own system
      if (!isPrivileged && user?.memberProfile?.system) {
        targetSystem = user.memberProfile.system;
      } else {
        // For admins/team captains, default to first preferred system of applicant
        targetSystem = preferredSystems[0];
      }
    }

    // Try to get config from database first, then fall back to hardcoded
    let config: ScorecardConfig | null | undefined = null;
    if (targetSystem) {
      config = await getScorecardConfig(team as Team, targetSystem);
    }
    
    // Fall back to hardcoded team config if no database config exists
    if (!config) {
      config = getHardcodedScorecardConfig(team as Team);
    }

    // Get list of available systems with configs for this team
    const dbConfigs = await getScorecardConfigs(team as Team);
    const systemsWithConfigs = dbConfigs.map(c => c.system).filter(Boolean) as string[];
    
    // Also include all team systems (for dropdown purposes)
    const allTeamSystems = TEAM_SYSTEMS[team as Team]?.map(s => s.value) || [];
    
    // isPrivileged already defined above
    // Fetch ALL submissions for this application/system (for aggregates)
    const allSubmissionsQuery = targetSystem
      ? adminDb
          .collection("applications")
          .doc(id)
          .collection("scorecards")
          .where("system", "==", targetSystem)
      : adminDb
          .collection("applications")
          .doc(id)
          .collection("scorecards");
    
    const allSubmissionsSnapshot = await allSubmissionsQuery.get();
    const allSubmissions: ScorecardSubmission[] = allSubmissionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      } as ScorecardSubmission;
    });

    // Find the current user's submission
    const mySubmission = allSubmissions.find(s => s.reviewerId === userId) || null;

    // Calculate aggregates
    const aggregates = config ? calculateAggregates(allSubmissions, config) : null;

    // For privileged users, include all individual submissions (without current user's for display purposes)
    const otherSubmissions = isPrivileged 
      ? allSubmissions.filter(s => s.reviewerId !== userId)
      : [];

    return NextResponse.json({ 
      config, 
      submission: mySubmission,
      allSubmissions: isPrivileged ? allSubmissions : [],
      otherSubmissions,
      aggregates,
      currentSystem: targetSystem,
      systemsWithConfigs,
      allTeamSystems,
      isPrivileged
    });

  } catch (error) {
    logger.error(error, "Failed to fetch scorecard data");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/applications/[id]/scorecard
 * Submit or update a scorecard for an application.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userId = decodedToken.uid;
    const user = await getUser(userId);

    // Verify user has staff-level access
    const staffRoles = [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB, UserRole.SYSTEM_LEAD, UserRole.REVIEWER];
    if (!user || !staffRoles.includes(user.role)) {
      return NextResponse.json({ error: "Forbidden: Staff access required" }, { status: 403 });
    }

    const body = await request.json();
    const { data, system } = body;

    const collectionRef = adminDb.collection("applications").doc(id).collection("scorecards");
    
    // Use a deterministic document ID based on reviewerId and system for idempotency
    // This prevents race conditions where concurrent requests create duplicate scorecards
    const docId = system ? `${userId}_${system.toLowerCase().replace(/\s+/g, '-')}` : userId;
    const docRef = collectionRef.doc(docId);
    
    // Use set with merge to make this idempotent - creates if not exists, updates if exists
    const submissionData: ScorecardSubmission = {
      id: docId,
      applicationId: id,
      reviewerId: userId,
      reviewerName: user?.name || "Unknown",
      system: system || undefined,
      data,
      submittedAt: new Date(),
      updatedAt: new Date(),
    };
    
    await docRef.set(submissionData, { merge: true });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error(error, "Failed to save scorecard");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
