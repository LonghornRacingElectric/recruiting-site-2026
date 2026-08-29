import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getRecruitingConfig, updateRecruitingStep, updateRenegEnabled } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { autoRejectUnscheduledInterviewApplicants, sweepOnDecisionAdvance } from "@/lib/firebase/applications";
import { appCache } from "@/lib/utils/appCache";
import { logger } from "@/lib/logger";
import { STEP_ORDER } from "@/lib/utils/statusUtils";


export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    
    // Try cache first
    const cachedStep = appCache.getRecruitingStep();
    // Always read the full doc: this admin endpoint also carries renegEnabled,
    // which the step cache doesn't hold. One doc read, admin-only traffic.
    void cachedStep;
    const config = await getRecruitingConfig();
    appCache.setRecruitingStep(config.currentStep);

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch recruiting config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();
    
    const body = await request.json();
    const { step, renegEnabled, confirm } = body;

    // Reneg toggle can be flipped on its own, without a step change.
    if (step === undefined && typeof renegEnabled === "boolean") {
      await updateRenegEnabled(renegEnabled, uid);
      return NextResponse.json({ success: true, renegEnabled }, { status: 200 });
    }

    if (!Object.values(RecruitingStep).includes(step)) {
        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    // Steps move forward one at a time. Re-saving the current step is the
    // documented sweep recovery. Skipping ahead silently misses one-shot
    // sweeps (close_interviews, day 2/3) and going back un-reveals decisions
    // applicants have already seen, so both need the step name typed back.
    // The UI collects it; this insists on it (#116).
    const { currentStep: before } = await getRecruitingConfig();
    const fromIdx = STEP_ORDER.indexOf(before);
    const toIdx = STEP_ORDER.indexOf(step);
    const isCurrent = toIdx === fromIdx;
    const isNext = toIdx === fromIdx + 1;
    if (!isCurrent && !isNext && confirm !== step) {
      const direction = toIdx < fromIdx ? "back" : "ahead";
      return NextResponse.json({
        error: `Moving ${direction} from ${before} to ${step} skips the normal order. Type the step name to confirm.`,
        requiresConfirmation: true,
      }, { status: 400 });
    }

    await updateRecruitingStep(step, uid);

    // Sweep failures are reported back, not just logged: the step itself has
    // already been written, so a silent failure looks like success while the
    // cycle sits half-swept. The fix is to re-save the same step, which
    // re-runs the sweep from where it got to.
    let sweepError: string | undefined;

    // Interview scheduling window has closed - reject applicants who never
    // booked a slot. This transition is one-shot, so a swallowed failure here
    // is harder to notice than the Day 2/3 case.
    if (step === RecruitingStep.CLOSE_INTERVIEWS) {
      try {
        const rejectedIds = await autoRejectUnscheduledInterviewApplicants();
        logger.info({ rejectedCount: rejectedIds.length, rejectedIds }, "Swept unscheduled interview applicants");
      } catch (err) {
        logger.error({ err }, "Failed to sweep unscheduled interview applicants");
        sweepError = "The step was saved, but the unscheduled-interview sweep did not finish. Save this same step again to re-run it.";
      }
    }

    // Entering Day 2/3 locks the previous day's acceptances: expire unanswered
    // offers and reject committed applicants' other applications.
    if (step === RecruitingStep.RELEASE_DECISIONS_DAY2 || step === RecruitingStep.RELEASE_DECISIONS_DAY3) {
      try {
        const result = await sweepOnDecisionAdvance(step);
        logger.info(
          { expired: result.expired.length, crossTeamRejected: result.crossTeamRejected.length, step },
          "Decision-advance sweep complete"
        );
      } catch (err) {
        logger.error({ err, step }, "Decision-advance sweep failed");
        sweepError = "The step was saved, but the decision sweep did not finish. Save this same step again to re-run it.";
      }
    }

    // Update cache
    appCache.setRecruitingStep(step);
    // Invalidate applications because their computed status/ratings depend on the step
    appCache.invalidateApplications();

    return NextResponse.json({ success: true, step, ...(sweepError ? { sweepError } : {}) });
  } catch (error) {
    logger.error(error, "Failed to update recruiting step");
    
    if (error instanceof Error && error.message === "Unauthorized") {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
       return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
