import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { updateApplication, addInterviewOffer, getApplication } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

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

    // Get current user for role-based logic
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const currentUser = userDoc.data() as User;

    const body = await request.json();
    const { status, systems } = body; // systems is optional array of system names

    if (!Object.values(ApplicationStatus).includes(status)) {
       return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    let updatedApp;

    // If advancing to interview status, create interview offers
    if (status === ApplicationStatus.INTERVIEW) {
      const application = await getApplication(id);
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      // Determine which systems to create offers for
      let systemsToOffer: string[] = [];

      if (systems && Array.isArray(systems) && systems.length > 0) {
        // Systems explicitly provided by client (from modal)
        systemsToOffer = systems;
      } else if (currentUser.role === UserRole.REVIEWER) {
        // Reviewers automatically use their own system
        if (!currentUser.memberProfile?.system) {
          return NextResponse.json({ 
            error: "Reviewer does not have a system assigned" 
          }, { status: 400 });
        }
        systemsToOffer = [currentUser.memberProfile.system];
      } else {
        // For other roles without explicit systems, try preferredSystems or preferredSystem
        const preferred = application.preferredSystems || 
          (application.preferredSystem ? [application.preferredSystem] : []);
        
        if (preferred.length === 0) {
          return NextResponse.json({ 
            error: "No systems specified. Please select which systems to extend interview offers for." 
          }, { status: 400 });
        }
        systemsToOffer = preferred;
      }

      // Create interview offers for each system
      const existingOfferSystems = new Set(
        application.interviewOffers?.map(o => o.system) || []
      );

      for (const system of systemsToOffer) {
        if (!existingOfferSystems.has(system)) {
          await addInterviewOffer(id, system);
        }
      }

      // Remove offered systems from rejectedBySystems list (un-reject if previously rejected)
      const currentRejections = application.rejectedBySystems || [];
      const updatedRejections = currentRejections.filter(
        sys => !systemsToOffer.includes(sys)
      );
      
      // Update rejectedBySystems if there were removals
      if (updatedRejections.length !== currentRejections.length) {
        await updateApplication(id, { rejectedBySystems: updatedRejections });
      }

      // Get updated application
      updatedApp = await getApplication(id);
    } else {
      // For other status changes, just update the status
      updatedApp = await updateApplication(id, { status });
    }

    return NextResponse.json({ application: updatedApp }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to update application status");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
