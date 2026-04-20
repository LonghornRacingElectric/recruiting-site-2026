import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  getApplication,
  updateApplication,
  updateApplicationFormData,
} from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { getRecruitingConfig, getApplicationQuestions } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { getUserVisibleStatus, sanitizeApplicationForApplicant } from "@/lib/utils/statusUtils";
import pino from "pino";

const logger = pino();

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]
 * Get a specific application by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [application, config] = await Promise.all([
      getApplication(id),
      getRecruitingConfig()
    ]);

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

    // Get the user-visible status
    const visibleStatus = getUserVisibleStatus(application, config.currentStep);

    // Sanitize the application data to remove internal decision fields
    // These should NEVER be sent to applicants as they could reveal rejection before release
    const sanitizedApplication = sanitizeApplicationForApplicant(application, config.currentStep);

    return NextResponse.json({ application: sanitizedApplication }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to get application");
    return NextResponse.json(
      { error: "Failed to get application" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications/[id]
 * Update an application (save progress or submit)
 * Body: { formData?: Partial<ApplicationFormData>, preferredSystems?: string[], status?: ApplicationStatus }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check Global Recruiting Step
    const config = await getRecruitingConfig();
    if (config.currentStep !== RecruitingStep.OPEN) {
      return NextResponse.json({ error: "Applications are closed" }, { status: 403 });
    }

    const existingApplication = await getApplication(id);

    if (!existingApplication) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Ensure user owns this application
    if (existingApplication.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Don't allow updates to submitted/reviewed applications
    if (existingApplication.status !== ApplicationStatus.IN_PROGRESS) {
      return NextResponse.json(
        { error: "Cannot update a submitted application" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { formData, preferredSystems, status } = body;

    // Validate preferred systems limit (max 3)
    if (preferredSystems && Array.isArray(preferredSystems) && preferredSystems.length > 3) {
      return NextResponse.json(
        { error: "You can select a maximum of 3 preferred systems" },
        { status: 400 }
      );
    }

    // Validate word counts when submitting
    if (status === ApplicationStatus.SUBMITTED) {
      const mergedFormData = formData
        ? { ...existingApplication.formData, ...formData }
        : existingApplication.formData;

      try {
        const questionsConfig = await getApplicationQuestions();
        const team = existingApplication.team;
        const allQuestions = [
          ...questionsConfig.commonQuestions,
          ...(questionsConfig.teamQuestions[team] || []),
          ...Object.values(questionsConfig.systemQuestions || {}).flat(),
        ];

        const overLimitFields: string[] = [];
        for (const q of allQuestions) {
          if (q.maxWordCount && (q.type === "text" || q.type === "textarea")) {
            // Check both top-level form fields and teamQuestions
            const value =
              mergedFormData?.[q.id as string] ||
              mergedFormData?.teamQuestions?.[q.id] ||
              "";
            if (typeof value === "string" && countWords(value) > q.maxWordCount) {
              overLimitFields.push(`${q.label} (max ${q.maxWordCount} words)`);
            }
          }
        }

        if (overLimitFields.length > 0) {
          return NextResponse.json(
            { error: `The following fields exceed the word limit: ${overLimitFields.join(", ")}` },
            { status: 400 }
          );
        }
      } catch (err) {
        logger.warn({ err }, "Could not validate word counts, proceeding without validation");
      }
    }

    let application;

    // If only formData is being updated, use the merge function
    if (formData && !preferredSystems && !status) {
      application = await updateApplicationFormData(id, formData);
    } else {
      // Update all provided fields
      const updates: Record<string, unknown> = {};
      if (formData) updates.formData = { ...existingApplication.formData, ...formData };
      if (preferredSystems) updates.preferredSystems = preferredSystems;
      if (status) updates.status = status;

      application = await updateApplication(id, updates);
    }

    return NextResponse.json({ application }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to update application");
    return NextResponse.json(
      { error: "Failed to update application" },
      { status: 500 }
    );
  }
}
