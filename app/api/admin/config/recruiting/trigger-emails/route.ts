import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/guard";
import { getRecruitingConfig, getEmailTemplatesConfig } from "@/lib/firebase/config";
import { adminDb } from "@/lib/firebase/admin";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { getUserVisibleStatus } from "@/lib/utils/statusUtils";
import { EmailTrigger } from "@/lib/models/EmailTemplate";
import { sendStatusEmail } from "@/lib/email/send";
import { markEmailSent } from "@/lib/firebase/applications";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// One email run at a time (#64). The admin UI sends a run as sequential
// batches of 50, so the lock belongs to a *run id* the client generates: every
// batch of that run re-enters, any other run gets a 409. The expiry is
// batch-sized, not run-sized — a batch killed by the platform timeout never
// reaches `finally`, and must not wedge the rest of its own run or the retry
// for long. The last batch (or a single un-batched request) releases the
// lock, and only its owner can.
const RUN_LOCK_DOC = "email_run_lock";
const RUN_LOCK_TTL_MS = 3 * 60 * 1000;
async function acquireRunLock(uid: string, step: string, runId: string): Promise<{ ok: true } | { ok: false; since?: Date }> {
  const ref = adminDb.collection("config").doc(RUN_LOCK_DOC);
  return adminDb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const d = snap.data();
    const until: Date | undefined = d?.lockedUntil?.toDate?.();
    const heldByAnotherRun = !!d && d.runId !== runId && !!until && until.getTime() > Date.now();
    if (heldByAnotherRun) {
      return { ok: false as const, since: d?.startedAt?.toDate?.() as Date | undefined };
    }
    t.set(ref, {
      runId,
      by: uid,
      step,
      startedAt: d?.runId === runId && d?.startedAt ? d.startedAt : new Date(),
      lockedUntil: new Date(Date.now() + RUN_LOCK_TTL_MS),
    });
    return { ok: true as const };
  });
}
async function releaseRunLock(runId: string): Promise<void> {
  const ref = adminDb.collection("config").doc(RUN_LOCK_DOC);
  await adminDb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (snap.exists && snap.data()?.runId === runId) t.delete(ref);
  }).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const { uid, user: actor } = await requireAdmin();
    
    const body = await request.json();
    const { step, force = false, applicationIds, runId: clientRunId, last = false } = body;
    // A batched run shares one id across its requests; a plain request is its own run.
    const runId = typeof clientRunId === "string" && clientRunId.trim() ? clientRunId.trim().slice(0, 64) : `single-${uid}-${randomUUID()}`;
    const releasesLock = !clientRunId || last === true;

    const config = await getRecruitingConfig();
    const currentStep = step || config.currentStep;

    const lock = await acquireRunLock(uid, String(currentStep), runId);
    if (!lock.ok) {
      return NextResponse.json(
        { error: `An email run is already in progress${lock.since ? ` (started ${lock.since.toISOString()})` : ""}. Wait for it to finish before starting another.` },
        { status: 409 }
      );
    }
    let results;
    try {
      results = await triggerEmails(currentStep, force, applicationIds);
    } finally {
      if (releasesLock) await releaseRunLock(runId);
    }

    await recordAudit(request, actor, { action: "emails.trigger", detail: `step ${currentStep}${force ? " (force)" : ""}${applicationIds?.length ? ` for ${applicationIds.length} applications` : ""}`, after: results as unknown as Record<string, unknown> });

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    logger.error(error, "Failed to trigger emails manually");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
         return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
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
  // Skips that are worth showing the admin: a missing template or a kill
  // switch means a whole cohort silently got nothing.
  const skipReasons: Record<string, number> = {};

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
          // Systems named in the email. Interview/trial emails name the system
          // that made the offer; everything else falls back to what they applied
          // for. An offer email with no offers on record is a data inconsistency
          // — rather than rendering the literal word "General" to an applicant
          // (buildEmailVariables' last-resort default, which reached 2 real
          // people last cycle), fall back to their preferred systems and warn.
          const offerSystems =
            visibleStatus === ApplicationStatus.INTERVIEW
              ? app.interviewOffers?.map(o => o.system) || []
              : visibleStatus === ApplicationStatus.TRIAL
              ? app.trialOffers?.map(o => o.system) || []
              : app.preferredSystems || [];

          if (offerSystems.length === 0) {
            logger.warn(
              { appId: app.id, trigger: expectedTrigger, status: visibleStatus },
              "Offer email has no systems recorded — falling back to preferred systems"
            );
          }

          const systemNames =
            offerSystems.length > 0 ? offerSystems : app.preferredSystems || [];

          const teamName = app.team || "Electric";

          logger.info({ appId: app.id, trigger: expectedTrigger }, "Sending email");
          
          const result = await sendStatusEmail({
            trigger: expectedTrigger,
            applicationId: app.id,
            applicantName: app.userName || "Applicant",
            applicantEmail: app.userEmail || "",
            teamName,
            systemNames,
            isFakeData: app.isFakeData,
            config: emailConfig,
          });

          if (result.sent) {
            // Only a real send is recorded. A skipped or failed send must stay
            // eligible for the next run — the non-force path skips anyone
            // already in emailsSent, so a false "sent" can never be retried
            // without force-sending to everyone who did get the email.
            await markEmailSent(app.id, expectedTrigger);
            sentCount++;

            // Safe rate (10/sec)
            await sleep(100);
          } else if (result.reason === "send_failed") {
            failedCount++;
          } else {
            skippedCount++;
            skipReasons[result.reason] = (skipReasons[result.reason] || 0) + 1;
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
  
  return { sentCount, skippedCount, failedCount, skipReasons };
}
