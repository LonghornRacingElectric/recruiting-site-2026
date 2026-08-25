import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { getScorecardConfig, getScorecardConfigs } from "@/lib/firebase/scorecards";
import { updateAggregateRating } from "@/lib/firebase/updateAggregateRating";
import { ScorecardSubmission, ScorecardConfig } from "@/lib/models/Scorecard";
import { ApplicationStatus } from "@/lib/models/Application";
import { Team, UserRole } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { checkTeamAccess, resolveScorecardSystem, STAFF_ROLES } from "@/lib/auth/teamAccess";
import { slugifySystem } from "@/lib/firebase/utils";
import { logger } from "@/lib/logger";


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
    if (!user || !STAFF_ROLES.includes(user.role)) {
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

    const url = new URL(request.url);

    // Check if user is privileged (can view multiple systems)
    const isHighPrivileged = user?.role === UserRole.ADMIN ||
      user?.role === UserRole.TEAM_CAPTAIN_OB;

    // Which system this caller is allowed to look at. Leads and reviewers are
    // pinned to their own — ?system= used to be honoured for everyone, which
    // exposed other systems' aggregate scores for the same candidate.
    const resolvedSystem = resolveScorecardSystem(user, application, url.searchParams.get("system"));
    if (resolvedSystem.error) {
      return NextResponse.json({ error: resolvedSystem.error }, { status: 403 });
    }
    const targetSystem = resolvedSystem.system;

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
    if (!user || !STAFF_ROLES.includes(user.role)) {
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

    // Which system this score is being filed under. Unvalidated, this let a
    // reviewer file into another system's pool and move its aggregate.
    const resolvedSystem = resolveScorecardSystem(user, application, system);
    if (resolvedSystem.error) {
      return NextResponse.json({ error: resolvedSystem.error }, { status: 403 });
    }
    const targetSystem = resolvedSystem.system;

    // Same rule as review scorecards: an unsubmitted draft can't be scored.
    if (application.status === ApplicationStatus.IN_PROGRESS) {
      return NextResponse.json(
        { error: "This application has not been submitted yet and cannot be scored" },
        { status: 400 }
      );
    }

    // Use a separate subcollection for interview scorecards
    const collectionRef = adminDb.collection("applications").doc(id).collection("interviewScorecards");

    // Use a deterministic document ID based on reviewerId and system for idempotency
    const docId = targetSystem ? `${userId}_${slugifySystem(targetSystem)}` : userId;
    const docRef = collectionRef.doc(docId);

    // Use set with merge to make this idempotent
    const submissionData: ScorecardSubmission = {
      id: docId,
      applicationId: id,
      reviewerId: userId,
      reviewerName: user?.name || "Unknown",
      system: targetSystem || undefined,
      scorecardType: "interview",
      data,
      submittedAt: new Date(),
      updatedAt: new Date(),
    };

    await docRef.set(submissionData, { merge: true });

    // Update aggregate rating atomically
    if (targetSystem) {
      try {
        await updateAggregateRating(id, targetSystem, "interview", application.team);
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

