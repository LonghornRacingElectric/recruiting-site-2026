import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getRecruitingConfig, getEmailTemplatesConfig } from "@/lib/firebase/config";
import { adminDb } from "@/lib/firebase/admin";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import { EmailTrigger } from "@/lib/models/EmailTemplate";
import { sendStatusEmail } from "@/lib/email/send";
import { updateApplication } from "@/lib/firebase/applications";
import pino from "pino";

const logger = pino();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    
    const body = await request.json();
    const { step, force = false, applicationIds } = body;

    const config = await getRecruitingConfig();
    const currentStep = step || config.currentStep;

    const results = await triggerEmails(currentStep, force, applicationIds);

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    logger.error(error, "Failed to trigger emails manually");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

async function triggerEmails(step: any, force: boolean, applicationIds?: string[]) {
  logger.info({ step, force, batchSize: applicationIds?.length }, "Starting email trigger job");
  
  let applications: Application[] = [];
  
  if (applicationIds && Array.isArray(applicationIds)) {
    // Fetch only specific IDs for batching
    // Firestore "in" queries are limited to 30 items
    const chunks = [];
    for (let i = 0; i < applicationIds.length; i += 30) {
      chunks.push(applicationIds.slice(i, i + 30));
    }
    
    for (const chunk of chunks) {
      const snapshot = await adminDb.collection("applications")
        .where("__name__", "in", chunk)
        .get();
        
      applications.push(...snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          submittedAt: data.submittedAt?.toDate(),
        } as Application;
      }));
    }
  } else {
    // Fallback: fetch all
    const snapshot = await adminDb.collection("applications").get();
    applications = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        submittedAt: data.submittedAt?.toDate(),
      } as Application;
    });
  }

  const emailConfig = await getEmailTemplatesConfig();
  
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

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
      
      if (expectedTrigger) {
        const alreadySent = !force && app.emailsSent && app.emailsSent.includes(expectedTrigger);
        
        if (!alreadySent) {
          const systemNames =
            visibleStatus === ApplicationStatus.INTERVIEW
              ? app.interviewOffers?.map(o => o.system) || []
              : visibleStatus === ApplicationStatus.TRIAL
              ? app.trialOffers?.map(o => o.system) || []
              : app.preferredSystems || [];

          const teamName = app.team || "Electric";

          logger.info({ appId: app.id, trigger: expectedTrigger }, "Sending email");
          
          await sendStatusEmail({
            trigger: expectedTrigger,
            applicantName: app.userName || "Applicant",
            applicantEmail: app.userEmail || "",
            teamName,
            systemNames,
            isFakeData: app.isFakeData,
            config: emailConfig,
          });
          
          if (!app.isFakeData && !app.userEmail.includes(".fake")) {
              const newEmailsSent = force 
                ? Array.from(new Set([...(app.emailsSent || []), expectedTrigger]))
                : [...(app.emailsSent || []), expectedTrigger];
              await updateApplication(app.id, { emailsSent: newEmailsSent });
              sentCount++;
              
              // Safe rate (10/sec)
              await sleep(100);
          } else {
              skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    } catch (err) {
      logger.error({ appId: app.id, err }, "Failed to process email");
      failedCount++;
    }
  }
  
  return { sentCount, skippedCount, failedCount };
}
