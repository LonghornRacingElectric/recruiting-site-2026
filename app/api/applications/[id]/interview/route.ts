import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication, selectInterviewSystem } from "@/lib/firebase/applications";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { getUserVisibleStatus, sanitizeApplicationForApplicant, isAtOrPast } from "@/lib/utils/statusUtils";
import { RecruitingStep } from "@/lib/models/Config";
import { slugifySystem } from "@/lib/firebase/utils";
import { appCache } from "@/lib/utils/appCache";
import { logger } from "@/lib/logger";

const INTERVIEW_CONFIGS_COLLECTION = "interviewConfigs";

/**
 * Helper to get the current user's UID from the session cookie
 */
async function getCurrentUserUid(request: NextRequest): Promise<string | null> {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    return decodedToken.uid;
  } catch (error) {
    logger.error({ err: error }, "Failed to verify session cookie");
    return null;
  }
}

/**
 * Get interview config for a team/system
 */
async function getInterviewConfig(
  team: Team,
  system: string
): Promise<InterviewSlotConfig | null> {
  const teamSlug = team.toLowerCase().replace(/\s+/g, "-");
  const systemSlug = slugifySystem(system);
  const configId = `${teamSlug}-${systemSlug}`;
  
  const doc = await adminDb
    .collection(INTERVIEW_CONFIGS_COLLECTION)
    .doc(configId)
    .get();

  if (!doc.exists) {
    // Try querying by team and system
    const snapshot = await adminDb
      .collection(INTERVIEW_CONFIGS_COLLECTION)
      .where("team", "==", team)
      .where("system", "==", system)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as InterviewSlotConfig;
  }

  return { id: doc.id, ...doc.data() } as InterviewSlotConfig;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]/interview
 * Get interview offers and status for an application
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const application = await getApplication(id);

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Ensure user owns this application
    if (application.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if application should show interview UI based on effective status
    const config = await getRecruitingConfig();
    const effectiveStatus = getUserVisibleStatus(application, config.currentStep);
    
    if (effectiveStatus !== ApplicationStatus.INTERVIEW) {
      return NextResponse.json(
        { error: "Application is not in interview stage" },
        { status: 400 }
      );
    }

    const interviewOffers = application.interviewOffers || [];
    const selectedSystem = application.selectedInterviewSystem;

    // For Combustion/Electric, check if they need to select a system. Selection
    // closes with the booking window (#114), so past close_interviews the
    // picker is never offered — the POST would refuse it.
    const needsSystemSelection =
      application.team !== Team.SOLAR &&
      interviewOffers.length > 1 &&
      !selectedSystem &&
      !isAtOrPast(config.currentStep, RecruitingStep.CLOSE_INTERVIEWS);

    // Resolve the signup link for the relevant offer(s)
    const offersWithLinks = await Promise.all(
      interviewOffers.map(async (offer) => {
        // For Combustion/Electric with selection, only surface the selected system
        if (
          application.team !== Team.SOLAR &&
          selectedSystem &&
          offer.system !== selectedSystem
        ) {
          return { ...offer };
        }

        // Only PENDING offers need a link — CANCELLED/COMPLETED/NO_SHOW are
        // just status displays now, no booking action attached to them.
        if (offer.status !== InterviewEventStatus.PENDING) {
          return { ...offer };
        }

        try {
          const interviewConfig = await getInterviewConfig(application.team, offer.system);
          if (!interviewConfig || !interviewConfig.signupLink) {
            return { ...offer, configMissing: true };
          }

          // The booking window closes at close_interviews; a pending offer past
          // that point is a status display, not an invitation to book.
          if (isAtOrPast(config.currentStep, RecruitingStep.CLOSE_INTERVIEWS)) {
            return { ...offer };
          }

          return { ...offer, signupLink: interviewConfig.signupLink };
        } catch (error) {
          logger.error({ err: error, system: offer.system }, "Failed to load interview config");
          return { ...offer, error: "Failed to load signup link" };
        }
      })
    );

    return NextResponse.json({
      team: application.team,
      // The cancel reason is a staff note (#75) — never served to the applicant.
      offers: offersWithLinks.map(({ cancelReason: _internal, ...offer }) => offer),
      selectedSystem,
      needsSystemSelection,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get interview info");
    return NextResponse.json(
      { error: "Failed to get interview information" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/applications/[id]/interview
 * Select interview system (for Combustion/Electric with multiple offers)
 * Body: { system: "Electronics" }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const application = await getApplication(id);

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Ensure user owns this application
    if (application.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if application should show interview UI based on effective status
    const config = await getRecruitingConfig();
    const effectiveStatus = getUserVisibleStatus(application, config.currentStep);
    
    if (effectiveStatus !== ApplicationStatus.INTERVIEW) {
      return NextResponse.json(
        { error: "Application is not in interview stage" },
        { status: 400 }
      );
    }

    // The booking window closes at close_interviews; after that a pick would
    // only narrow preferredSystems on an application the sweep may already
    // have rejected (#114). Deliberately not keyed on a masked rejection: a
    // per-applicant refusal while peers succeed would reveal the decision.
    if (isAtOrPast(config.currentStep, RecruitingStep.CLOSE_INTERVIEWS)) {
      return NextResponse.json(
        { error: "Interview selection is closed for this application" },
        { status: 400 }
      );
    }

    // The choice is one-way. Selecting again cancels the offer they are
    // actually holding and narrows preferredSystems a second time, which is
    // what scopes reviewer and system-lead visibility — so a re-pick hides the
    // applicant from a system that may be mid-review.
    if (application.selectedInterviewSystem) {
      return NextResponse.json(
        {
          error: `You have already selected ${application.selectedInterviewSystem} for your interview. Contact recruiting if you need to change it.`,
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { system } = body;

    if (!system) {
      return NextResponse.json(
        { error: "System is required" },
        { status: 400 }
      );
    }

    const updatedApplication = await selectInterviewSystem(id, system);

    // preferredSystems changed, which is what scopes reviewer/system-lead visibility
    appCache.invalidateApplications();

    const sanitizedApplication = sanitizeApplicationForApplicant(updatedApplication!, config.currentStep);

    return NextResponse.json({
      success: true,
      application: sanitizedApplication,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to select interview system");
    const message = error instanceof Error ? error.message : "Failed to select system";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
