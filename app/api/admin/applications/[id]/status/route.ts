import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, getApplication } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import { getStageDecisionForStatus } from "@/lib/utils/statusUtils";
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
        // For other roles without explicit systems, try preferredSystems
        const preferred = application.preferredSystems || [];
        
        if (preferred.length === 0) {
          return NextResponse.json({ 
            error: "No systems specified. Please select which systems to extend interview offers for." 
          }, { status: 400 });
        }
        systemsToOffer = preferred;
      }

      // Atomically create interview offers and un-reject systems in a single transaction
      // Also set reviewDecision since we're advancing from review to interview
      updatedApp = await addMultipleInterviewOffers(id, systemsToOffer, 'advanced');
    } else if (status === ApplicationStatus.TRIAL) {
      // If advancing to trial status, create trial offers
      const application = await getApplication(id);
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      // Determine which systems to create trial offers for
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
        // For other roles without explicit systems, use systems with completed interviews
        const completedInterviewSystems = application.interviewOffers
          ?.filter(o => o.status === 'completed')
          .map(o => o.system) || [];
        
        if (completedInterviewSystems.length === 0) {
          return NextResponse.json({ 
            error: "No systems specified. Please select which systems to extend trial offers for." 
          }, { status: 400 });
        }
        systemsToOffer = completedInterviewSystems;
      }

      // Atomically create trial offers and un-reject systems in a single transaction
      // Also set interviewDecision since we're advancing from interview to trial
      updatedApp = await addMultipleTrialOffers(id, systemsToOffer, 'advanced');
    } else {
      // For other status changes (reject, accept), update status and stage decision
      const application = await getApplication(id);
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      
      logger.info({ 
        currentStatus: application.status, 
        newStatus: status,
        action: 'status_change'
      }, "Processing status change");
      
      const { field, decision } = getStageDecisionForStatus(application.status, status);
      
      logger.info({ field, decision }, "Stage decision computed");
      
      // Build update object with status and stage decision if applicable
      const updateData: Record<string, unknown> = { status };
      if (field) {
        updateData[field] = decision;
      }
      
      // If rejecting from interview stage, clear interview offers
      if (application.status === ApplicationStatus.INTERVIEW && status === ApplicationStatus.REJECTED) {
        updateData.interviewOffers = [];
        updateData.selectedInterviewSystem = null;
        logger.info("Clearing interview offers");
      }
      
      // If rejecting from trial stage, clear trial offers
      if (application.status === ApplicationStatus.TRIAL && status === ApplicationStatus.REJECTED) {
        updateData.trialOffers = [];
        logger.info("Clearing trial offers");
      }
      
      logger.info({ updateData }, "About to update application with data");
      
      updatedApp = await updateApplication(id, updateData as any);
    }

    return NextResponse.json({ application: updatedApp }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to update application status");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
