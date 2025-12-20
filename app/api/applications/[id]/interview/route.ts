import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication, selectInterviewSystem } from "@/lib/firebase/applications";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { getAvailableSlots } from "@/lib/google/calendar";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import pino from "pino";

const logger = pino();
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
  const configId = `${team.toLowerCase()}-${system.toLowerCase().replace(/\s+/g, "-")}`;
  
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

    // For Combustion/Electric, check if they need to select a system
    const needsSystemSelection =
      application.team !== Team.SOLAR &&
      interviewOffers.length > 1 &&
      !selectedSystem;

    // Get available slots for the relevant offer(s)
    const offersWithSlots = await Promise.all(
      interviewOffers.map(async (offer) => {
        // For Combustion/Electric with selection, only get slots for selected system
        if (
          application.team !== Team.SOLAR &&
          selectedSystem &&
          offer.system !== selectedSystem
        ) {
          return { ...offer, availableSlots: [] };
        }

        // Skip slot fetching only if already scheduled (not for cancelled - allow reschedule)
        if (offer.status === InterviewEventStatus.SCHEDULED) {
          return { ...offer, availableSlots: [] };
        }

        try {
          const config = await getInterviewConfig(application.team, offer.system);
          if (!config) {
            return { ...offer, availableSlots: [], configMissing: true };
          }

          // Check if calendar ID is configured - if not, config is still being set up
          if (!config.calendarId) {
            return { ...offer, availableSlots: [], configPending: true };
          }

          // Get slots for next 2 weeks
          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + 14);

          const slots = await getAvailableSlots(config, startDate, endDate);
          return { ...offer, availableSlots: slots };
        } catch (error) {
          logger.error({ err: error, system: offer.system }, "Failed to get slots");
          return { ...offer, availableSlots: [], error: "Failed to load slots" };
        }
      })
    );

    return NextResponse.json({
      team: application.team,
      offers: offersWithSlots,
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

    const body = await request.json();
    const { system } = body;

    if (!system) {
      return NextResponse.json(
        { error: "System is required" },
        { status: 400 }
      );
    }

    const updatedApplication = await selectInterviewSystem(id, system);

    return NextResponse.json({
      success: true,
      application: updatedApplication,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to select interview system");
    const message = error instanceof Error ? error.message : "Failed to select system";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
