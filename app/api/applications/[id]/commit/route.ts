import { NextRequest, NextResponse } from "next/server";
import { getApplication, respondToCommitment } from "@/lib/firebase/applications";
import { getSystemLeads } from "@/lib/firebase/users";
import { sendCommitmentNotificationToLeads } from "@/lib/email/send";
import { adminAuth } from "@/lib/firebase/admin";
import { appCache } from "@/lib/utils/appCache";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getUserVisibleStatus, sanitizeApplicationForApplicant } from "@/lib/utils/statusUtils";
import { ApplicationStatus } from "@/lib/models/Application";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const { accepted, reason } = await req.json();

    // Verify session
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userId = decodedToken.uid;

    const application = await getApplication(applicationId);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (typeof accepted !== "boolean") {
      return NextResponse.json({ error: "accepted must be true or false" }, { status: 400 });
    }

    // Decisions are masked until their release day, but the raw status is
    // written the moment staff decide. Gate on what the applicant is allowed
    // to see, so an acceptance made during trial_workday cannot be acted on,
    // or probed for, before it is released. This also covers day-2/3 offers
    // on day 1 and declines.
    const config = await getRecruitingConfig();
    if (getUserVisibleStatus(application, config.currentStep) !== ApplicationStatus.ACCEPTED) {
      return NextResponse.json({ error: "There is no offer to respond to right now" }, { status: 400 });
    }

    const updatedApplication = await respondToCommitment(applicationId, accepted, reason);
    if (!updatedApplication) {
      return NextResponse.json({ error: "Failed to process commitment" }, { status: 500 });
    }

    // Status changed (possibly on several applications, if this was a reneg)
    appCache.invalidateApplications();

    // Notify leads
    // We need to know which system they were accepted to. 
    // This should be in application.offer.system or similar.
    // Based on Application model:
    /*
      offer?: {
        system: string;
        role: string;
        details?: string;
        issuedAt: Date;
      };
    */
    const systemName = application.offer?.system || "Unknown System";
    const teamName = application.team;
    const applicantName = application.userName || "Unknown Applicant";

    const leads = await getSystemLeads(teamName, systemName);
    const leadEmails = leads.map(l => l.email).filter(Boolean);

    // Fire and forget email notification
    sendCommitmentNotificationToLeads({
      applicantName,
      teamName,
      systemName,
      accepted,
      reason,
      leadEmails
    });

    // Never return the raw document to the applicant — respondToCommitment
    // spreads the whole Firestore doc, decisions and ratings included.
    return NextResponse.json({
      application: sanitizeApplicationForApplicant(updatedApplication, config.currentStep),
    });
  } catch (error) {
    // Past the gate, a thrown Error is a rule the applicant can act on (reneg
    // window closed, already committed elsewhere) — surface it as a 400.
    if (error instanceof Error) {
      logger.warn({ err: error }, "Commitment refused");
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Failed to process commitment");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
