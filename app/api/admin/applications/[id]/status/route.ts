import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, getApplication, revertToSubmitted, updateApplicationIfUnchanged, ApplicationConflictError } from "@/lib/firebase/applications";
import { requireStaffForApplication } from "@/lib/auth/guard";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole, User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getStageDecisionForStatus, isAtOrPast } from "@/lib/utils/statusUtils";
import { validateStaffTransition } from "@/lib/utils/transitions";
import { sendStatusEmail } from "@/lib/email/send";
import type { EmailTrigger } from "@/lib/models/EmailTemplate";
import { appCache } from "@/lib/utils/appCache";
import { logger } from "@/lib/logger";
import { recordAudit, snapshotApplication } from "@/lib/firebase/audit";


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
    const { status, systems, offer, releaseDay } = body; // systems is optional array of system names, offer is optional offer details, releaseDay is an optional 1|2|3 for trial-stage decisions (#58)

    if (!Object.values(ApplicationStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Every staff status change goes through the transition table: which
    // statuses it may come from, the earliest step it is allowed at, which
    // roles may make it, and the statuses staff may never set. See
    // lib/utils/transitions.ts for the history behind each rule.
    const current = await getApplication(id);
    if (!current) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    // Every refusal on this route is recorded — the role fences below
    // included: a lead repeatedly trying to act on another system's behalf is
    // exactly what those fences exist to catch.
    const refuse = async (httpStatus: number, error: string) => {
      await recordAudit(request, currentUser, { action: "application.status", outcome: "refused", applicationId: id, applicantTeam: current.team, detail: `${current.status} → ${status}: ${error}` });
      return NextResponse.json({ error }, { status: httpStatus });
    };
    const { currentStep: stepNow } = await getRecruitingConfig();
    const refusal = validateStaffTransition({ from: current.status, to: status, role: currentUser.role, step: stepNow });
    if (refusal) return refuse(refusal.status, refusal.error);

    // A system lead may only extend interview offers for their own system.
    // Captains and admins can offer on behalf of any system on the team (the
    // "TC override"). Trial offers, waitlisting and rejections are deliberately
    // NOT fenced — PM's call, 2026-07-22.
    if (status === ApplicationStatus.INTERVIEW && currentUser.role === UserRole.SYSTEM_LEAD) {
      const leadSystem = currentUser.memberProfile?.system;

      if (!leadSystem) {
        return refuse(403, "Your account has no system assigned. Ask an admin to set your system before extending interview offers.");
      }

      // No explicit systems means the route would fall back to every preferred
      // system, which for a lead would offer on other systems' behalf.
      if (!systems || !Array.isArray(systems) || systems.length === 0) {
        return NextResponse.json({
          error: `Select which system to extend an interview offer for (${leadSystem}).`
        }, { status: 400 });
      }

      const foreign = systems.filter((s: string) => s !== leadSystem);
      if (foreign.length > 0) {
        return refuse(403, `System leads can only extend interview offers for their own system (${leadSystem}). Ask your team captain to offer for ${foreign.join(", ")}.`);
      }
    }

    // A system lead may only accept an applicant into their own system. Placing
    // someone in another system is a team captain / admin decision — the intent
    // is to stop accidental cross-system accepts, so the error names the fix.
    if (status === ApplicationStatus.ACCEPTED && currentUser.role === UserRole.SYSTEM_LEAD) {
      const leadSystem = currentUser.memberProfile?.system;
      const offerSystem = offer?.system;

      if (!leadSystem) {
        return refuse(403, "Your account has no system assigned. Ask an admin to set your system before accepting applicants.");
      }

      if (!offerSystem || offerSystem !== leadSystem) {
        return refuse(403, `System leads can only accept applicants into their own system (${leadSystem}). Ask your team captain to accept into ${offerSystem || "another system"}.`);
      }
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

      // Once the applicant has chosen their interview system, the others were
      // cancelled by that choice and cannot be re-offered — there is no way
      // to book them (#127). Only the chosen system may be offered again.
      const chosen = application.selectedInterviewSystem;
      if (chosen && systemsToOffer.some((sys: string) => sys !== chosen)) {
        return refuse(400, `The applicant already chose ${chosen} for their interview; other systems can't be offered now.`);
      }

      // System leads can ONLY extend interview offers for their own system
      if (currentUser.role === UserRole.SYSTEM_LEAD) {
        const userSystem = currentUser.memberProfile?.system;
        if (!userSystem) {
          return refuse(403, "System lead profile not configured properly");
        }
        // Filter to only their system - they cannot offer for other systems
        const originalSystems = [...systemsToOffer];
        systemsToOffer = systemsToOffer.filter(s => s === userSystem);
        if (systemsToOffer.length === 0) {
          return refuse(403, `System leads can only extend interview offers for their own system (${userSystem}). None of the selected systems match.`);
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
          return refuse(403, "System lead profile not configured properly");
        }
        // Filter to only their system - they cannot offer for other systems
        const originalSystems = [...systemsToOffer];
        systemsToOffer = systemsToOffer.filter(s => s === userSystem);
        if (systemsToOffer.length === 0) {
          return refuse(403, `System leads can only extend trial offers for their own system (${userSystem}). None of the selected systems match.`);
        }
        if (systemsToOffer.length < originalSystems.length) {
          logger.info({
            userId: currentUser.uid,
            original: originalSystems,
            filtered: systemsToOffer
          }, "System lead trial offer filtered to own system only");
        }
      }

      // addMultipleTrialOffers enforces one trial invite per application and
      // throws otherwise, which the catch below would render as a bare 500.
      // Say so here instead, while the caller can still act on it.
      if (systemsToOffer.length > 1) {
        return NextResponse.json({
          error: "Only one trial workday invite can be extended per application. Select a single system."
        }, { status: 400 });
      }

      // Atomically create trial offers and un-reject systems in a single transaction
      // Also set interviewDecision since we're advancing from interview to trial
      updatedApp = await addMultipleTrialOffers(id, systemsToOffer, 'advanced');
    } else if (status === ApplicationStatus.SUBMITTED) {
      // Revert to a fresh review: full reset, original submission time kept.
      // Never a draft — the transition table refuses those (#127).
      updatedApp = await revertToSubmitted(id);
    } else {
      // For other status changes (reject, accept), update status and stage decision
      const application = await getApplication(id);
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      logger.info({
        applicationId: id,
        actorUid: currentUser.uid,
        actorRole: currentUser.role,
        currentStatus: application.status,
        newStatus: status,
        action: 'status_change'
      }, "Processing status change");

      const config = await getRecruitingConfig();
      const currentStep = config.currentStep;

      const { field, decision } = getStageDecisionForStatus(application.status, status, currentStep);

      logger.info({ field, decision }, "Stage decision computed");

      // Build update object with status and stage decision if applicable
      const updateData: Record<string, unknown> = { status };
      if (field) {
        updateData[field] = decision;
      }

      // releaseDay is meaningful only for a trial-stage decision (#58). Refuse
      // it anywhere else rather than drop it — the UI promised a day.
      const releaseDayGiven = releaseDay !== undefined && releaseDay !== null;
      if (releaseDayGiven && field !== 'trialDecision') {
        return NextResponse.json({ error: "releaseDay only applies to trial-stage decisions" }, { status: 400 });
      }

      // If this is a trial decision (accept/reject/waitlist), track which day it was made
      if (field === 'trialDecision') {
        // Determine which day the decision was made
        // Decisions made during TRIAL_WORKDAY are visible on DAY 1.
        // Decisions made during RELEASE_DECISIONS_DAY1 are visible on DAY 2.
        // Decisions made during RELEASE_DECISIONS_DAY2 are visible on DAY 3.
        let decisionDay: 1 | 2 | 3 = 1;
        if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY1) {
          decisionDay = 2;
        } else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2 || currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) {
          decisionDay = 3;
        }

        // Staff may choose the release day explicitly (#58): the inference
        // above is only a default, and it is wrong whenever staff decide during
        // the Day-1 step but mean the result to show on Day 1.
        if (releaseDayGiven) {
          if (typeof releaseDay !== "number" || ![1, 2, 3].includes(releaseDay)) {
            return NextResponse.json({ error: "releaseDay must be 1, 2 or 3" }, { status: 400 });
          }
          decisionDay = releaseDay as 1 | 2 | 3;
        }
        updateData.trialDecisionDay = decisionDay;
        logger.info({ decisionDay, currentStep, explicit: releaseDayGiven }, "Set trial decision day");
      }

      // The waitlist modal picks a system too; it used to be dropped on the floor.
      // Staff-facing only (the sanitizer strips it) and cleared on the way out
      // so a stale system never outlives the waitlist.
      if (status === ApplicationStatus.WAITLISTED && typeof offer?.system === "string") {
        updateData.waitlistSystem = offer.system;
      } else if (application.status === ApplicationStatus.WAITLISTED && status !== ApplicationStatus.WAITLISTED) {
        updateData.waitlistSystem = FieldValue.delete();
      }

      // Un-rejecting: an acceptance or waitlist decision means the earlier
      // stages were passed, so stale stage rejections must not keep the
      // applicant's dashboard on "Rejected" (getUserVisibleStatus checks
      // reviewDecision first). Trial offers do the same in addMultipleTrialOffers.
      if (status === ApplicationStatus.ACCEPTED || status === ApplicationStatus.WAITLISTED) {
        if (application.reviewDecision === "rejected") updateData.reviewDecision = "advanced";
        if (application.interviewDecision === "rejected") updateData.interviewDecision = "advanced";
      }

      // If accepting, save offer details if provided
      if (status === ApplicationStatus.ACCEPTED && offer) {
        updateData.offer = {
          ...offer,
          issuedAt: new Date()
        };
      }

      // Leaving ACCEPTED (rescinded to the waitlist, or rejected) withdraws the
      // offer: the sanitizer would otherwise keep shipping it to the applicant
      // and the dashboard would keep rendering the acceptance card.
      if (status !== ApplicationStatus.ACCEPTED && application.status === ApplicationStatus.ACCEPTED && application.offer) {
        updateData.offer = FieldValue.delete();
      }

      // If rejecting, clean up accidental or unreleased offers depending on current recruiting step
      if (status === ApplicationStatus.REJECTED) {
        const isBeforeInterviews = !isAtOrPast(currentStep, RecruitingStep.RELEASE_INTERVIEWS);
        const isBeforeTrial = !isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL);

        if (isBeforeInterviews) {
          updateData.interviewOffers = [];
          updateData.trialOffers = [];
          updateData.selectedInterviewSystem = null;
          logger.info("Clearing interview and trial offers (rejection before interviews release)");
        } else if (isBeforeTrial) {
          updateData.trialOffers = [];
          logger.info("Clearing trial offers (rejection before trial release)");
        } else if (application.status === ApplicationStatus.INTERVIEW) {
          // Intentional exception to preserving released interview offers: an
          // applicant still at INTERVIEW once trial has released never converted
          // their offer, so it's cleared rather than kept as history.
          updateData.interviewOffers = [];
          updateData.selectedInterviewSystem = null;
          logger.info("Clearing interview offers (rejection during interview stage)");
        }
      }

      logger.info({ updateData }, "About to update application with data");

      // Guarded write (#66): if another staff member changed this application
      // since it was loaded, this returns 409 instead of silently overwriting.
      updatedApp = await updateApplicationIfUnchanged(id, updateData as any, { status: current.status });
    }

    // Invalidate global application cache after successful status change
    appCache.invalidateApplications();

    await recordAudit(request, currentUser, {
      action: "application.status",
      applicationId: id,
      applicantTeam: current.team,
      systems: Array.isArray(systems) && systems.length ? systems : offer?.system ? [offer.system] : undefined,
      before: snapshotApplication(current),
      after: snapshotApplication(updatedApp),
      detail: `${current.status} → ${status}`,
    });

    return NextResponse.json({ application: updatedApp }, { status: 200 });

  } catch (error) {
    if (error instanceof ApplicationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error(error, "Failed to update application status");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error instanceof Error && error.message === "Application not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
