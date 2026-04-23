import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { getApplication, updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, rejectApplicationFromSystems } from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { getRecruitingConfig } from "@/lib/firebase/config";
import { getStageDecisionForStatus, computeHighWaterMark, isAtOrPast } from "@/lib/utils/statusUtils";
import { appCache } from "@/lib/utils/appCache";
import pino from "pino";

const logger = pino();

type BulkAction = "accept" | "reject" | "waitlist" | "interview" | "trial";

interface BulkStatusRequest {
  applicationIds: string[];
  action: BulkAction;
  systems?: string[];
}

/**
 * POST /api/admin/applications/bulk-status
 */
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

    if (!action || !["accept", "reject", "waitlist", "interview", "trial"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (applicationIds.length > 100) {
      return NextResponse.json({ error: "Maximum batch size is 100 applications" }, { status: 400 });
    }

    // System leads can only act on their own system
    const isHigherAuthority = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_CAPTAIN_OB;

    // For interview/trial, systems are ALWAYS required. 
    // For reject, it's required for system leads, but optional for higher authorities (will reject all preferred).
    if (["interview", "trial"].includes(action) && (!systems || systems.length === 0)) {
      return NextResponse.json({ error: "Systems array is required for this action" }, { status: 400 });
    }
    
    if (action === "reject" && !isHigherAuthority && (!systems || systems.length === 0)) {
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

          // Team-based authorization check for non-admins
          if (!isHigherAuthority && currentUser.role !== UserRole.ADMIN) {
            const userTeam = currentUser.memberProfile?.team;
            if (!userTeam || userTeam !== application.team) {
              return { id: appId, success: false, error: "No access to this application" };
            }
          }

          switch (action) {
            case "interview": {
              await addMultipleInterviewOffers(appId, effectiveSystems, 'advanced');
              return { id: appId, success: true };
            }

            case "trial": {
              await addMultipleTrialOffers(appId, effectiveSystems, 'advanced');
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
              updateData.statusHighWaterMark = computeHighWaterMark(
                application.statusHighWaterMark,
                ApplicationStatus.ACCEPTED
              );
              if (field === 'trialDecision') {
                let decisionDay: 1 | 2 | 3 = 1;
                if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2) decisionDay = 2;
                else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) decisionDay = 3;
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
              updateData.statusHighWaterMark = computeHighWaterMark(
                application.statusHighWaterMark,
                ApplicationStatus.WAITLISTED
              );
              if (wField === 'trialDecision') {
                let decisionDay: 1 | 2 | 3 = 1;
                if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2) decisionDay = 2;
                else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) decisionDay = 3;
                updateData.trialDecisionDay = decisionDay;
              }
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
