import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getRecruitingConfig, updateRecruitingStep } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { adminDb } from "@/lib/firebase/admin";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import { EmailTrigger } from "@/lib/models/EmailTemplate";
import { sendStatusEmail } from "@/lib/email/send";
import { updateApplication } from "@/lib/firebase/applications";
import pino from "pino";

const logger = pino();

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const config = await getRecruitingConfig();
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
    const { step } = body;

    if (!Object.values(RecruitingStep).includes(step)) {
        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    const oldConfig = await getRecruitingConfig();
    const oldStep = oldConfig.currentStep;

    await updateRecruitingStep(step, uid);
    
    // If the step is transitioning to a RELEASE stage, trigger emails in the background
    if (oldStep !== step && [
      RecruitingStep.RELEASE_INTERVIEWS,
      RecruitingStep.RELEASE_TRIAL,
      RecruitingStep.RELEASE_DECISIONS_DAY1,
      RecruitingStep.RELEASE_DECISIONS_DAY2,
      RecruitingStep.RELEASE_DECISIONS_DAY3
    ].includes(step)) {
      triggerReleaseEmails(step).catch(err => logger.error({err}, "Background email trigger failed"));
    }

    return NextResponse.json({ success: true, step });
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

async function triggerReleaseEmails(step: RecruitingStep) {
  logger.info({ step }, "Starting release email background job");
  
  const snapshot = await adminDb.collection("applications").get();
  
  const applications = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });

  for (const app of applications) {
    try {
      const visibleStatus = getUserVisibleStatus(app, step);
      
      const triggerMap: Partial<Record<ApplicationStatus, EmailTrigger>> = {
        [ApplicationStatus.INTERVIEW]: "interview_offered",
        [ApplicationStatus.TRIAL]: "trial_offered",
        [ApplicationStatus.ACCEPTED]: "accepted",
        [ApplicationStatus.REJECTED]: "rejected",
        [ApplicationStatus.WAITLISTED]: "waitlisted",
      };

      const expectedTrigger = triggerMap[visibleStatus];
      
      if (expectedTrigger && (!app.emailsSent || !app.emailsSent.includes(expectedTrigger))) {
        const systemNames =
          visibleStatus === ApplicationStatus.INTERVIEW
            ? app.interviewOffers?.map(o => o.system) || []
            : visibleStatus === ApplicationStatus.TRIAL
            ? app.trialOffers?.map(o => o.system) || []
            : app.preferredSystems || [];

        const teamName = app.team || "Electric";

        logger.info({ appId: app.id, trigger: expectedTrigger }, "Sending release email");
        
        await sendStatusEmail({
          trigger: expectedTrigger,
          applicantName: app.userName || "Applicant",
          applicantEmail: app.userEmail || "",
          teamName,
          systemNames,
        });
        
        const newEmailsSent = [...(app.emailsSent || []), expectedTrigger];
        await updateApplication(app.id, { emailsSent: newEmailsSent });
      }
    } catch (err) {
      logger.error({ appId: app.id, err }, "Failed to process release email for application");
    }
  }
  
  logger.info("Finished release email background job");
}
