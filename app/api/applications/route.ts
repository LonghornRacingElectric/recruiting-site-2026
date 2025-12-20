import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  createApplication,
  getUserApplications,
} from "@/lib/firebase/applications";
import { Team } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import pino from "pino";

const logger = pino();

/**
 * Helper to get the current user's UID from the session cookie
 */
async function getCurrentUserUid(request: NextRequest): Promise<string | null> {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    return decodedToken.uid;
  } catch (error) {
    logger.error({ err: error }, "Failed to verify session cookie");
    return null;
  }
}

/**
 * Masks the application status based on the global recruiting step.
 * Uses stage-specific decisions to determine what status the user should see.
 */
function maskApplicationStatus(app: Application, step: RecruitingStep): Application {
  const effectiveStatus = getUserVisibleStatus(app, step);
  return { ...app, status: effectiveStatus };
}

/**
 * GET /api/applications
 * Get all applications for the current user
 */
export async function GET(request: NextRequest) {
  const uid = await getCurrentUserUid(request);

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  try {
    const [applications, config] = await Promise.all([
        getUserApplications(uid),
        getRecruitingConfig()
    ]);

    const maskedApplications = applications.map(app => 
        maskApplicationStatus(app, config.currentStep)
    );

    return NextResponse.json({ 
      applications: maskedApplications,
      step: config.currentStep 
    }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to get applications");
    return NextResponse.json(
      { error: "Failed to get applications" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/applications
 * Create a new application for a team
 * Body: { team: "Electric" | "Solar" | "Combustion" }
 */
export async function POST(request: NextRequest) {
  const uid = await getCurrentUserUid(request);

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { team } = body;

    // Check Global Recruiting Step
    const config = await getRecruitingConfig();
    if (config.currentStep !== RecruitingStep.OPEN) {
        return NextResponse.json({ error: "Applications are closed" }, { status: 403 });
    }

    // Validate team
    if (!team || !Object.values(Team).includes(team)) {
      return NextResponse.json(
        { error: "Invalid team. Must be Electric, Solar, or Combustion" },
        { status: 400 }
      );
    }

    const application = await createApplication({
      userId: uid,
      team: team as Team,
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create application");
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 }
    );
  }
}
