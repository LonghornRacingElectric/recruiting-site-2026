import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { getScorecardConfig, getScorecardConfigs } from "@/lib/firebase/scorecards";
import { updateAggregateRating } from "@/lib/firebase/updateAggregateRating";
import { ScorecardSubmission, ScorecardConfig } from "@/lib/models/Scorecard";
import { Team, UserRole } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import pino from "pino";

const logger = pino();

import { calculateAggregates } from "@/lib/scorecards/aggregates";


/**
 * GET /api/admin/applications/[id]/interview-scorecard
 * Fetch interview scorecard config, user's submission, all submissions, and aggregates.
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

    // Team-based authorization: non-admin users must belong to the application's team
    const teamAccessError = checkTeamAccess(user, application);
    if (teamAccessError) {
      return NextResponse.json({ error: teamAccessError }, { status: 403 });
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

    // Get INTERVIEW scorecard config from database
    let config: ScorecardConfig | null = null;
    if (targetSystem) {
      config = await getScorecardConfig(application.team, targetSystem, "interview");
    }

    // Get list of available systems with interview configs for this team
    const dbConfigs = await getScorecardConfigs(application.team, "interview");
    const systemsWithConfigs = dbConfigs.map(c => c.system).filter(Boolean) as string[];

    // Also include all team systems (for dropdown purposes)
    const allTeamSystems = TEAM_SYSTEMS[application.team as Team]?.map(s => s.value) || [];

    // Determine if user can see individual submissions for the current system
    const isSystemLead = user?.role === UserRole.SYSTEM_LEAD;
    const userSystem = user?.memberProfile?.system;
    const canSeeSubmissions = isHighPrivileged ||
      (isSystemLead && userSystem && targetSystem === userSystem);

    // Fetch ALL interview scorecard submissions for this application/system
    const allSubmissionsQuery = targetSystem
      ? adminDb
        .collection("applications")
        .doc(id)
        .collection("interviewScorecards")
        .where("system", "==", targetSystem)
      : adminDb
        .collection("applications")
        .doc(id)
        .collection("interviewScorecards");

    const allSubmissionsSnapshot = await allSubmissionsQuery.get();
    const allSubmissions: ScorecardSubmission[] = allSubmissionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        scorecardType: "interview",
        submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      } as ScorecardSubmission;
    });

    // Find the current user's submission
    const mySubmission = allSubmissions.find(s => s.reviewerId === userId) || null;

    // Calculate aggregates
    const aggregates = config ? calculateAggregates(allSubmissions, config) : null;

    // For users who can see submissions, include all individual submissions
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
    logger.error(error, "Failed to fetch interview scorecard data");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/applications/[id]/interview-scorecard
 * Submit or update an interview scorecard for an application.
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

    // Get the application to know the team
    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Team-based authorization: non-admin users must belong to the application's team
    const teamAccessError = checkTeamAccess(user, application);
    if (teamAccessError) {
      return NextResponse.json({ error: teamAccessError }, { status: 403 });
    }

    // Use a separate subcollection for interview scorecards
    const collectionRef = adminDb.collection("applications").doc(id).collection("interviewScorecards");

    // Use a deterministic document ID based on reviewerId and system for idempotency
    const docId = system ? `${userId}_${system.toLowerCase().replace(/\s+/g, '-')}` : userId;
    const docRef = collectionRef.doc(docId);

    // Use set with merge to make this idempotent
    const submissionData: ScorecardSubmission = {
      id: docId,
      applicationId: id,
      reviewerId: userId,
      reviewerName: user?.name || "Unknown",
      system: system || undefined,
      scorecardType: "interview",
      data,
      submittedAt: new Date(),
      updatedAt: new Date(),
    };

    await docRef.set(submissionData, { merge: true });

    // Update aggregate rating atomically
    if (system) {
      try {
        await updateAggregateRating(id, system, "interview", application.team);
      } catch (err) {
        // Log but don't fail the request - the scorecard was saved
        logger.error(err, "Failed to update interview aggregate rating");
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error(error, "Failed to save interview scorecard");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

