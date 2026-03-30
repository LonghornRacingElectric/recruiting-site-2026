import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, getApplication } from "@/lib/firebase/applications";
import { requireStaffForApplication } from "@/lib/auth/guard";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getStageDecisionForStatus } from "@/lib/utils/statusUtils";
import pino from "pino";

const logger = pino();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify staff access AND team-based authorization
    const { user: currentUser } = await requireStaffForApplication(id);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status, systems, offer } = body; // systems is optional array of system names, offer is optional offer details

    if (!Object.values(ApplicationStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Prevent waitlisting/accepting/rejecting of applications that aren't submitted
    if (status === ApplicationStatus.WAITLISTED || status === ApplicationStatus.ACCEPTED) {
      const application = await getApplication(id);
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      if (application.status === ApplicationStatus.IN_PROGRESS) {
        return NextResponse.json({ error: "Cannot waitlist or accept an in-progress application" }, { status: 400 });
      }
    }

    // Reviewers cannot advance or reject applicants - they can only submit scorecards and notes
    if (currentUser.role === UserRole.REVIEWER) {
      return NextResponse.json({
        error: "Reviewers are not authorized to advance or reject applicants"
      }, { status: 403 });
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
      } else {
        // For roles without explicit systems, try preferredSystems
        const preferred = application.preferredSystems || [];

        if (preferred.length === 0) {
          return NextResponse.json({
            error: "No systems specified. Please select which systems to extend interview offers for."
          }, { status: 400 });
        }
        systemsToOffer = preferred;
      }

      // System leads can ONLY extend interview offers for their own system
      if (currentUser.role === UserRole.SYSTEM_LEAD) {
        const userSystem = currentUser.memberProfile?.system;
        if (!userSystem) {
          return NextResponse.json({
            error: "System lead profile not configured properly"
          }, { status: 403 });
        }
        // Filter to only their system - they cannot offer for other systems
        const originalSystems = [...systemsToOffer];
        systemsToOffer = systemsToOffer.filter(s => s === userSystem);
        if (systemsToOffer.length === 0) {
          return NextResponse.json({
            error: `System leads can only extend interview offers for their own system (${userSystem}). None of the selected systems match.`
          }, { status: 403 });
        }
        if (systemsToOffer.length < originalSystems.length) {
          logger.info({
            userId: currentUser.uid,
            original: originalSystems,
            filtered: systemsToOffer
          }, "System lead offer filtered to own system only");
        }
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
      } else {
        // For roles without explicit systems, use systems with completed interviews
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

      // System leads can ONLY extend trial offers for their own system
      if (currentUser.role === UserRole.SYSTEM_LEAD) {
        const userSystem = currentUser.memberProfile?.system;
        if (!userSystem) {
          return NextResponse.json({
            error: "System lead profile not configured properly"
          }, { status: 403 });
        }
        // Filter to only their system - they cannot offer for other systems
        const originalSystems = [...systemsToOffer];
        systemsToOffer = systemsToOffer.filter(s => s === userSystem);
        if (systemsToOffer.length === 0) {
          return NextResponse.json({
            error: `System leads can only extend trial offers for their own system (${userSystem}). None of the selected systems match.`
          }, { status: 403 });
        }
        if (systemsToOffer.length < originalSystems.length) {
          logger.info({
            userId: currentUser.uid,
            original: originalSystems,
            filtered: systemsToOffer
          }, "System lead trial offer filtered to own system only");
        }
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

      // If this is a trial decision (accept/reject/waitlist), track which day it was made
      if (field === 'trialDecision') {
        const config = await getRecruitingConfig();
        const currentStep = config.currentStep;

        // Determine which day the decision was made
        let decisionDay: 1 | 2 | 3 = 1;
        if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2) {
          decisionDay = 2;
        } else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) {
          decisionDay = 3;
        }

        updateData.trialDecisionDay = decisionDay;
        logger.info({ decisionDay, currentStep }, "Set trial decision day");
      }

      // If accepting, save offer details if provided
      if (status === ApplicationStatus.ACCEPTED && offer) {
        updateData.offer = {
          ...offer,
          issuedAt: new Date()
        };
      }

      // If rejecting from interview stage, clear interview offers
      if (application.status === ApplicationStatus.INTERVIEW && status === ApplicationStatus.REJECTED) {
        // Clear interview offers when rejected
        updateData.interviewOffers = [];
        updateData.selectedInterviewSystem = null;
        logger.info("Clearing interview offers (rejection)");
      }

      // If rejecting or waitlisting from trial stage, clear trial offers
      if (application.status === ApplicationStatus.TRIAL &&
        (status === ApplicationStatus.REJECTED || status === ApplicationStatus.WAITLISTED)) {
        updateData.trialOffers = [];
        logger.info("Clearing trial offers (rejection/waitlist)");
      }

      logger.info({ updateData }, "About to update application with data");

      updatedApp = await updateApplication(id, updateData as any);
    }

    return NextResponse.json({ application: updatedApp }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to update application status");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Application not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
