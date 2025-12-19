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
 * Prevents applicants from seeing "Rejected" or "Interview" status before it's released.
 */
function maskApplicationStatus(app: Application, step: RecruitingStep): Application {
  // If we are in the OPEN or REVIEWING phase, hide everything past SUBMITTED
  if (step === RecruitingStep.OPEN || step === RecruitingStep.REVIEWING) {
      if (['interview', 'trial', 'accepted', 'rejected'].includes(app.status)) {
         return { ...app, status: 'submitted' as any };
      }
  }
  
  // If we are releasing INTERVIEWS
  if (step === RecruitingStep.RELEASE_INTERVIEWS || step === RecruitingStep.INTERVIEWING) {
      if (['trial', 'accepted'].includes(app.status)) {
           return { ...app, status: 'interview' as any };
      }
      
      if (app.status === 'rejected') {
           return { ...app, status: 'submitted' as any };
      }
  }

  // If we are releasing TRIAL invites
  if (step === RecruitingStep.RELEASE_TRIAL || step === RecruitingStep.TRIAL_WORKDAY) {
      if (app.status === 'accepted') {
          return { ...app, status: 'trial' as any };
      }

      if (app.status === 'rejected') {
          return { ...app, status: 'submitted' as any };
      }
  }

  return app;
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
