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

import { calculateAggregates, AggregateScore, AggregateData } from "@/lib/scorecards/aggregates";


/**
 * GET /api/admin/applications/[id]/scorecard
 * Fetch scorecard config, user's submission, all submissions, and aggregates.
 * Query params:
 *   - system: Optional system to get config for (for multi-system viewing)
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

    const application = await getApplication(id);
    if (!application) {
       return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Get requested system from query params, or default based on user role
    const url = new URL(request.url);
    const requestedSystem = url.searchParams.get("system");
    
    // Check if user is privileged (can view multiple systems)
    const isHighPrivileged = user?.role === UserRole.ADMIN || 
                              user?.role === UserRole.TEAM_CAPTAIN_OB;
    
    // Determine which system to use
    let targetSystem: string | undefined = requestedSystem || undefined;
    if (!targetSystem) {
      // For non-privileged users (reviewers, system leads), default to their own system
      if (!isHighPrivileged && user?.memberProfile?.system) {
        targetSystem = user.memberProfile.system;
      } else {
        // For admins/team captains, default to first preferred system of applicant
        const preferredSystems = application.preferredSystems || [];
        targetSystem = preferredSystems[0];
      }
    }

    // Try to get config from database first, then fall back to hardcoded
    let config: ScorecardConfig | null | undefined = null;
    if (targetSystem) {
      config = await getScorecardConfig(application.team, targetSystem);
    }
    
    // Fall back to hardcoded team config if no database config exists
    if (!config) {
      config = getHardcodedScorecardConfig(application.team);
    }

    // Get list of available systems with configs for this team
    const dbConfigs = await getScorecardConfigs(application.team);
    const systemsWithConfigs = dbConfigs.map(c => c.system).filter(Boolean) as string[];
    
    // Also include all team systems (for dropdown purposes)
    const allTeamSystems = TEAM_SYSTEMS[application.team as Team]?.map(s => s.value) || [];
    
    // Determine if user can see individual submissions for the current system
    // Admins/Captains can see all, System Leads can see their own system's submissions
    const isSystemLead = user?.role === UserRole.SYSTEM_LEAD;
    const userSystem = user?.memberProfile?.system;
    const canSeeSubmissions = isHighPrivileged || 
                               (isSystemLead && userSystem && targetSystem === userSystem);
    
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

    // For users who can see submissions, include all individual submissions (without current user's for display purposes)
    const otherSubmissions = canSeeSubmissions 
      ? allSubmissions.filter(s => s.reviewerId !== userId)
      : [];

    return NextResponse.json({ 
      config, 
      submission: mySubmission,
      allSubmissions: canSeeSubmissions ? allSubmissions : [],
      otherSubmissions,
      aggregates,
      currentSystem: targetSystem,
      systemsWithConfigs,
      allTeamSystems,
      isPrivileged: isHighPrivileged,
      canSeeSubmissions
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
