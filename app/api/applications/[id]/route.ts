import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  getApplication,
  updateApplication,
  updateApplicationFormData,
} from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
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

    return NextResponse.json({ application }, { status: 200 });
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
 * Body: { formData?: Partial<ApplicationFormData>, preferredSystem?: string, status?: ApplicationStatus }
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
    const { formData, preferredSystem, status } = body;

    let application;

    // If only formData is being updated, use the merge function
    if (formData && !preferredSystem && !status) {
      application = await updateApplicationFormData(id, formData);
    } else {
      // Update all provided fields
      const updates: Record<string, unknown> = {};
      if (formData) updates.formData = { ...existingApplication.formData, ...formData };
      if (preferredSystem) updates.preferredSystem = preferredSystem;
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
