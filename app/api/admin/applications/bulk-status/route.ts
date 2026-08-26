import { NextRequest, NextResponse } from "next/server";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { requireStaff } from "@/lib/auth/guard";
import { getApplication, updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, rejectApplicationFromSystems } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getStageDecisionForStatus, isAtOrPast } from "@/lib/utils/statusUtils";
import { appCache } from "@/lib/utils/appCache";
import { logger } from "@/lib/logger";


type BulkAction = "accept" | "reject" | "waitlist" | "interview" | "trial" | "submitted";

interface BulkStatusRequest {
  applicationIds: string[];
  action: BulkAction;
  systems?: string[];
}

/**
 * POST /api/admin/applications/bulk-status
 */
/**
 * Systems a bulk interview/trial offer targets for one application.
 *
 * Explicit systems are intersected with what the applicant ranked: an offer
 * for a system they never listed is invisible to that system's lead (scoping
 * is a preferredSystems array-contains), and it used to be exactly what a
 * captain's own system got stamped onto every selected applicant. With no
 * systems given (admins and captains), an interview offer goes to every ranked
 * system and a trial offer to the one system they interviewed for.
 */
function resolveBulkSystems(
  application: Application,
  requested: string[],
  action: "interview" | "trial"
): { systems: string[]; error?: string } {
  const ranked: string[] = application.preferredSystems || [];
  if (requested.length > 0) {
    const systems = requested.filter((s) => ranked.includes(s));
    return systems.length > 0
      ? { systems }
      : { systems: [], error: `Applicant did not rank ${requested.join(", ")}` };
  }
  if (action === "interview") {
    return ranked.length > 0 ? { systems: ranked } : { systems: [], error: "Applicant has no ranked systems" };
  }
  const completed = (application.interviewOffers || [])
    .filter((o) => o.status === InterviewEventStatus.COMPLETED)
    .map((o) => o.system);
  const candidates =
    completed.length > 0 ? completed : application.selectedInterviewSystem ? [application.selectedInterviewSystem] : ranked;
  if (candidates.length === 1) return { systems: candidates };
  return {
    systems: [],
    error: candidates.length === 0 ? "Applicant has no system to offer a trial for" : "Select which system the trial offer is for",
  };
}

export async function POST(request: NextRequest) {
  try {
    const { user: currentUser } = await requireStaff();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Reviewers cannot perform bulk actions
    if (currentUser.role === UserRole.REVIEWER) {
      return NextResponse.json({
        error: "Reviewers are not authorized to perform bulk status actions"
      }, { status: 403 });
    }

    const body: BulkStatusRequest = await request.json();
    const { applicationIds, action, systems } = body;

    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return NextResponse.json({ error: "applicationIds array is required" }, { status: 400 });
    }

    if (!action || !["accept", "reject", "waitlist", "interview", "trial", "submitted"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (applicationIds.length > 100) {
      return NextResponse.json({ error: "Maximum batch size is 100 applications" }, { status: 400 });
    }

    // System leads can only act on their own system
    const isHigherAuthority = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_CAPTAIN_OB;

    // Interview, trial and reject need a system per application. Leads must
    // name theirs. Admins and captains may omit it: the toolbar has no system
    // picker for them, and each application supplies its own default below
    // (ranked systems for interview and reject, the interviewed system for
    // trial). Requiring it here made bulk Interview/Trial fail for exactly the
    // roles that run the cycle.
    if (["interview", "trial", "reject"].includes(action) && !isHigherAuthority && (!systems || systems.length === 0)) {
      return NextResponse.json({ error: "Systems array is required for this action" }, { status: 400 });
    }

    let effectiveSystems = systems || [];
    if (!isHigherAuthority && currentUser.role === UserRole.SYSTEM_LEAD) {
      const userSystem = currentUser.memberProfile?.system;
      if (!userSystem) {
        return NextResponse.json({ error: "System lead profile not configured properly" }, { status: 403 });
      }
      effectiveSystems = effectiveSystems.filter(s => s === userSystem);
      if (effectiveSystems.length === 0 && ["interview", "trial", "reject"].includes(action)) {
        return NextResponse.json({
          error: `System leads can only perform actions for their own system (${userSystem})`
        }, { status: 403 });
      }
    }

    // Get recruiting config for trial decision day and validations
    const config = await getRecruitingConfig();
    const currentStep = config.currentStep;

    // Server-side validation based on Recruiting Step
    if (action === "trial" && !isAtOrPast(currentStep, RecruitingStep.INTERVIEWING)) {
      return NextResponse.json({ error: "Trial offers cannot be extended at the current recruiting step" }, { status: 400 });
    }

    if (["accept", "waitlist"].includes(action) && !isAtOrPast(currentStep, RecruitingStep.TRIAL_WORKDAY)) {
      return NextResponse.json({ error: "Accept/Waitlist decisions cannot be made at the current recruiting step" }, { status: 400 });
    }

    // Process each application
    const results = await Promise.allSettled(
      applicationIds.map(async (appId) => {
        try {
          const application = await getApplication(appId);
          if (!application) {
            return { id: appId, success: false, error: "Application not found" };
          }

          // Same per-record scoping as every single-application route: captains
          // are limited to their team, leads to their team and to applications
          // that ranked their system. The old inline check exempted captains
          // entirely (isHigherAuthority already included them) and never
          // looked at preferredSystems for leads.
          const accessError = checkTeamAccess(currentUser, application);
          if (accessError) {
            return { id: appId, success: false, error: accessError };
          }

          switch (action) {
            case "interview": {
              const target = resolveBulkSystems(application, effectiveSystems, "interview");
              if (target.error) return { id: appId, success: false, error: target.error };
              await addMultipleInterviewOffers(appId, target.systems, 'advanced');
              return { id: appId, success: true };
            }

            case "trial": {
              const target = resolveBulkSystems(application, effectiveSystems, "trial");
              if (target.error) return { id: appId, success: false, error: target.error };
              await addMultipleTrialOffers(appId, target.systems, 'advanced');
              return { id: appId, success: true };
            }

            case "reject": {
              let systemsToReject = effectiveSystems;
              if (systemsToReject.length === 0 && isHigherAuthority) {
                // Reject from all preferred systems if none specified
                systemsToReject = application.preferredSystems || [];
              }
              await rejectApplicationFromSystems(appId, systemsToReject);
              return { id: appId, success: true };
            }

            case "accept": {
              const { field, decision } = getStageDecisionForStatus(application.status, ApplicationStatus.ACCEPTED);
              const updateData: Record<string, unknown> = { status: ApplicationStatus.ACCEPTED };
              if (field) {
                updateData[field] = decision;
              }
              if (field === 'trialDecision') {
                // Decisions made during TRIAL_WORKDAY are visible on DAY 1.
                // Decisions made during RELEASE_DECISIONS_DAY1 are visible on DAY 2.
                // Decisions made during RELEASE_DECISIONS_DAY2 are visible on DAY 3.
                let decisionDay: 1 | 2 | 3 = 1;
                if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY1) {
                  decisionDay = 2;
                } else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2 || currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) {
                  decisionDay = 3;
                }
                updateData.trialDecisionDay = decisionDay;
              }
              await updateApplication(appId, updateData as any);
              return { id: appId, success: true };
            }

            case "waitlist": {
              const { field: wField, decision: wDecision } = getStageDecisionForStatus(application.status, ApplicationStatus.WAITLISTED);
              const updateData: Record<string, unknown> = { status: ApplicationStatus.WAITLISTED };
              if (wField) {
                updateData[wField] = wDecision;
              }
              if (wField === 'trialDecision') {
                // Decisions made during TRIAL_WORKDAY are visible on DAY 1.
                // Decisions made during RELEASE_DECISIONS_DAY1 are visible on DAY 2.
                // Decisions made during RELEASE_DECISIONS_DAY2 are visible on DAY 3.
                let decisionDay: 1 | 2 | 3 = 1;
                if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY1) {
                  decisionDay = 2;
                } else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2 || currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) {
                  decisionDay = 3;
                }
                updateData.trialDecisionDay = decisionDay;
              }
              await updateApplication(appId, updateData as any);
              return { id: appId, success: true };
            }

            case "submitted": {
              const updateData: Record<string, unknown> = { 
                status: ApplicationStatus.SUBMITTED,
                reviewDecision: 'pending',
                interviewDecision: 'pending',
                trialDecision: 'pending',
              };
              await updateApplication(appId, updateData as any);
              return { id: appId, success: true };
            }

            default:
              return { id: appId, success: false, error: "Unknown action" };
          }
        } catch (err) {
          logger.error({ appId, action, err }, "Failed to process bulk action for application");
          return { id: appId, success: false, error: err instanceof Error ? err.message : "Unknown error" };
        }
      })
    );

    // Extract results from Promise.allSettled
    const processedResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        id: applicationIds[index],
        success: false,
        error: result.reason?.message || "Processing failed"
      };
    });

    const successCount = processedResults.filter(r => r.success).length;
    const failCount = processedResults.filter(r => !r.success).length;

    // Invalidate application cache on success
    if (successCount > 0) {
      appCache.invalidateApplications();
    }

    logger.info({
      action,
      total: applicationIds.length,
      successCount,
      failCount,
      userId: currentUser.uid
    }, "Bulk status update completed");

    return NextResponse.json({
      results: processedResults,
      summary: { total: applicationIds.length, success: successCount, failed: failCount }
    }, { status: 200 });

  } catch (error) {
    logger.error(error, "Failed to process bulk status update");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
