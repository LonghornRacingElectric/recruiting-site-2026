import { NextRequest, NextResponse } from "next/server";
import { checkTeamAccess, DRAFT_ACTION_ERROR } from "@/lib/auth/teamAccess";
import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { requireStaff } from "@/lib/auth/guard";
import { getApplication, updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, rejectApplicationFromSystems, revertToSubmitted } from "@/lib/firebase/applications";
import { validateStaffTransition } from "@/lib/utils/transitions";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getStageDecisionForStatus, isAtOrPast } from "@/lib/utils/statusUtils";
import { appCache } from "@/lib/utils/appCache";
import { logger } from "@/lib/logger";
import { recordAuditMany } from "@/lib/firebase/audit";


// No bulk accept: an acceptance carries a per-applicant offer (system, role)
// that someone has to choose, and bulk had been writing none (#110).
type BulkAction = "reject" | "waitlist" | "interview" | "trial" | "submitted";

const TARGET_STATUS: Record<BulkAction, ApplicationStatus> = {
  reject: ApplicationStatus.REJECTED,
  waitlist: ApplicationStatus.WAITLISTED,
  interview: ApplicationStatus.INTERVIEW,
  trial: ApplicationStatus.TRIAL,
  submitted: ApplicationStatus.SUBMITTED,
};

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
    // Deliberately stricter than the single-application route, which lets a
    // captain pull one applicant into a system they didn't rank (#104):
    // stamping an unranked system across a whole selection is the accident
    // case this intersection exists to stop (#54).
    const systems = requested.filter((s) => ranked.includes(s));
    if (systems.length === 0) {
      return { systems: [], error: `Applicant did not rank ${requested.join(", ")}` };
    }
    // Same one-invite-per-application rule addMultipleTrialOffers enforces.
    // Reported here so a two-system bulk run comes back as a per-applicant
    // error rather than a thrown exception logged as an incident.
    if (action === "trial" && systems.length > 1) {
      return { systems: [], error: "Select a single system for the trial offer" };
    }
    return { systems };
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

    if (!action || !["reject", "waitlist", "interview", "trial", "submitted"].includes(action)) {
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

    if (action === "waitlist" && !isAtOrPast(currentStep, RecruitingStep.RELEASE_TRIAL)) {
      return NextResponse.json({ error: "Waitlist decisions can't be made until trial offers are released" }, { status: 400 });
    }

    // Team of each application, for the audit entries written after the loop.
    const teamsById: Record<string, string> = {};

    // Process each application
    // `refused` marks a rule stopping the actor (team access, drafts, the
    // transition table, per-system targeting); everything else that fails is
    // an error, and the audit log keeps the two apart.
    type BulkResult = { id: string; success: boolean; error?: string; refused?: boolean };
    const results = await Promise.allSettled(
      applicationIds.map(async (appId): Promise<BulkResult> => {
        try {
          const application = await getApplication(appId);
          if (!application) {
            return { id: appId, success: false, error: "Application not found" };
          }
          teamsById[appId] = application.team;

          // Same per-record scoping as every single-application route: captains
          // are limited to their team, leads to their team and to applications
          // that ranked their system. The old inline check exempted captains
          // entirely (isHigherAuthority already included them) and never
          // looked at preferredSystems for leads.
          const accessError = checkTeamAccess(currentUser, application);
          if (accessError) {
            return { id: appId, success: false, error: accessError, refused: true };
          }

          // Drafts are not reviewable — and not submittable by staff (#127);
          // see the single-application status route.
          if (application.status === ApplicationStatus.IN_PROGRESS) {
            return { id: appId, success: false, error: DRAFT_ACTION_ERROR, refused: true };
          }

          // Same transition table as the single-application route, per item.
          const refusal = validateStaffTransition({
            from: application.status,
            to: TARGET_STATUS[action as BulkAction],
            role: currentUser.role,
            step: currentStep,
            perSystemReject: true, // bulk reject is already scoped to the lead's own system
          });
          if (refusal) {
            return { id: appId, success: false, error: refusal.error, refused: true };
          }

          switch (action) {
            case "interview": {
              const target = resolveBulkSystems(application, effectiveSystems, "interview");
              if (target.error) return { id: appId, success: false, error: target.error, refused: true };
              // See the single-application route: nothing but the chosen
              // system can be offered once the applicant has chosen (#127).
              if (application.selectedInterviewSystem && target.systems.some((sys: string) => sys !== application.selectedInterviewSystem)) {
                return { id: appId, success: false, error: `Applicant already chose ${application.selectedInterviewSystem} for their interview; other systems can't be offered now`, refused: true };
              }
              await addMultipleInterviewOffers(appId, target.systems, 'advanced');
              return { id: appId, success: true };
            }

            case "trial": {
              const target = resolveBulkSystems(application, effectiveSystems, "trial");
              if (target.error) return { id: appId, success: false, error: target.error, refused: true };
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

            case "waitlist": {
              const { field: wField, decision: wDecision } = getStageDecisionForStatus(application.status, ApplicationStatus.WAITLISTED);
              const updateData: Record<string, unknown> = { status: ApplicationStatus.WAITLISTED };
              if (wField) {
                updateData[wField] = wDecision;
              }
              // Un-rejecting (see the single-application route).
              if (application.reviewDecision === "rejected") updateData.reviewDecision = "advanced";
              if (application.interviewDecision === "rejected") updateData.interviewDecision = "advanced";
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
              // Full reset (offers, decisions, commitment, decision day),
              // keeping the original submission time (#108).
              await revertToSubmitted(appId);
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
    const processedResults: BulkResult[] = results.map((result, index) => {
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

    // One audit entry per application — bulk is where "who rejected 50 people"
    // has to be answerable — written as one batch, not N parallel adds.
    await recordAuditMany(request, currentUser, processedResults.map((r) => ({
      action: "application.bulk",
      outcome: r.success ? "ok" : r.refused ? "refused" : "error",
      applicationId: r.id,
      applicantTeam: teamsById[r.id],
      systems: effectiveSystems.length ? effectiveSystems : undefined,
      detail: r.success ? `bulk ${action}` : `bulk ${action}: ${r.error}`,
    })));

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
