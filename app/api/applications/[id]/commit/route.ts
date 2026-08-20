import { NextRequest, NextResponse } from "next/server";
import { getApplication, respondToCommitment } from "@/lib/firebase/applications";
import { getSystemLeads } from "@/lib/firebase/users";
import { sendCommitmentNotificationToLeads } from "@/lib/email/send";
import { adminAuth } from "@/lib/firebase/admin";
import { appCache } from "@/lib/utils/appCache";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const { accepted, reason, declineReasons } = await req.json();

    // A falsy non-boolean must not silently become a decline.
    if (typeof accepted !== "boolean") {
      return NextResponse.json({ error: "accepted field is required" }, { status: 400 });
    }

    // Applicant-supplied decline reasons for their other offers, keyed by
    // application id. Keep only sane string values; the transaction only ever
    // applies them to this user's own ACCEPTED applications.
    const safeDeclineReasons: Record<string, string> = {};
    if (declineReasons && typeof declineReasons === "object" && !Array.isArray(declineReasons)) {
      for (const [appId, value] of Object.entries(declineReasons)) {
        if (typeof value === "string" && value.trim()) {
          safeDeclineReasons[appId] = value.trim().slice(0, 1000);
        }
      }
    }

    // Verify session
    const sessionCookie = req.cookies.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie);
    const userId = decodedToken.uid;

    const application = await getApplication(applicationId);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedApplication = await respondToCommitment(applicationId, accepted, reason, safeDeclineReasons);
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

    return NextResponse.json({ application: updatedApplication });
  } catch (error: any) {
    console.error("Error in commitment API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
