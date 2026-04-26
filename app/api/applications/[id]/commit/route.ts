import { NextRequest, NextResponse } from "next/server";
import { getApplication, respondToCommitment } from "@/lib/firebase/applications";
import { getSystemLeads } from "@/lib/firebase/users";
import { sendCommitmentNotificationToLeads } from "@/lib/email/send";
import { adminAuth } from "@/lib/firebase/admin";

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

    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie);
    const userId = decodedToken.uid;

    const application = await getApplication(applicationId);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (application.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedApplication = await respondToCommitment(applicationId, accepted, reason);
    if (!updatedApplication) {
      return NextResponse.json({ error: "Failed to process commitment" }, { status: 500 });
    }

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
