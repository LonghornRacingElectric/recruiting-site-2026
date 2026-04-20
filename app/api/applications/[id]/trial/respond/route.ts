import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { sanitizeApplicationForApplicant } from "@/lib/utils/statusUtils";
import { FieldValue } from "firebase-admin/firestore";
import pino from "pino";

const logger = pino();

/**
 * POST - Respond to a trial workday offer (accept or reject)
 * Body: { accepted: boolean, rejectionReason?: string }
 */
export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decodedToken.uid;

    // Get the application
    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Verify the user owns this application
    if (application.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if there's a trial offer
    if (!application.trialOffers || application.trialOffers.length === 0) {
      return NextResponse.json({ error: "No trial offer found" }, { status: 400 });
    }

    const body = await request.json();
    const { accepted, rejectionReason } = body;

    if (typeof accepted !== "boolean") {
      return NextResponse.json({ error: "accepted field is required" }, { status: 400 });
    }

    // If rejecting, require a reason
    if (!accepted && !rejectionReason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
    }

    // Get the trial offer (there's only one per application)
    const trialOffer = application.trialOffers[0];

    // Check if already responded
    if (trialOffer.accepted !== undefined) {
      return NextResponse.json({ 
        error: "You have already responded to this trial offer" 
      }, { status: 400 });
    }

    // Update the trial offer with the response - only include defined fields
    const updatedTrialOffer: Record<string, unknown> = {
      system: trialOffer.system,
      status: trialOffer.status,
      createdAt: trialOffer.createdAt,
      accepted,
      respondedAt: new Date(),
    };
    
    // Only add rejectionReason if rejecting
    if (!accepted && rejectionReason?.trim()) {
      updatedTrialOffer.rejectionReason = rejectionReason.trim();
    }

    // Update in Firestore
    const applicationRef = adminDb.collection("applications").doc(id);
    await applicationRef.update({
      trialOffers: [updatedTrialOffer],
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Refetch the updated application
    const updatedApp = await getApplication(id);
    const config = await getRecruitingConfig();
    const sanitizedApp = sanitizeApplicationForApplicant(updatedApp!, config.currentStep);

    return NextResponse.json({ 
      application: sanitizedApp,
      message: accepted ? "Trial workday accepted!" : "Trial workday declined" 
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to respond to trial offer");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
