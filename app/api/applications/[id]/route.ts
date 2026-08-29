import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import {
  getApplication,
  updateApplication,
  updateApplicationFormData,
} from "@/lib/firebase/applications";
import { ApplicationStatus } from "@/lib/models/Application";
import { getRecruitingConfig, getApplicationQuestions } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { getUserVisibleStatus, sanitizeApplicationForApplicant } from "@/lib/utils/statusUtils";
import { sanitizeIncomingFormData } from "@/lib/utils/formAnswers";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { logger } from "@/lib/logger";


function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Helper to get the current user's UID from the session cookie
 */
async function getCurrentUserUid(request: NextRequest): Promise<string | null> {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    return decodedToken.uid;
  } catch (error) {
    logger.error({ err: error }, "Failed to verify session cookie");
    return null;
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]
 * Get a specific application by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [application, config] = await Promise.all([
      getApplication(id),
      getRecruitingConfig()
    ]);

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Ensure user owns this application
    if (application.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the user-visible status
    const visibleStatus = getUserVisibleStatus(application, config.currentStep);

    // Sanitize the application data to remove internal decision fields
    // These should NEVER be sent to applicants as they could reveal rejection before release
    const sanitizedApplication = sanitizeApplicationForApplicant(application, config.currentStep);

    return NextResponse.json({ application: sanitizedApplication }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to get application");
    return NextResponse.json(
      { error: "Failed to get application" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications/[id]
 * Update an application (save progress or submit)
 * Body: { formData?: Partial<ApplicationFormData>, preferredSystems?: string[], status?: ApplicationStatus }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const uid = await getCurrentUserUid(request);
  const { id } = await params;

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check Global Recruiting Step
    const config = await getRecruitingConfig();
    if (config.currentStep !== RecruitingStep.OPEN) {
      return NextResponse.json({ error: "Applications are closed" }, { status: 403 });
    }

    const existingApplication = await getApplication(id);

    if (!existingApplication) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Ensure user owns this application
    if (existingApplication.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Applicants may edit a draft *or* an application they already submitted —
    // the real gate is the recruiting step check above, which stops all edits
    // the moment applications close (and before reviewing begins, so answers
    // can't change under a reviewer). Anything further along the pipeline is
    // locked regardless.
    const EDITABLE_STATUSES: ApplicationStatus[] = [
      ApplicationStatus.IN_PROGRESS,
      ApplicationStatus.SUBMITTED,
    ];
    if (!EDITABLE_STATUSES.includes(existingApplication.status)) {
      return NextResponse.json(
        { error: "This application can no longer be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { preferredSystems, status } = body;

    // An applicant may only move their own application between the two statuses
    // they own. This value reaches Firestore unmodified, and nothing downstream
    // re-derives how it got there — `POST /commit` gates on status === ACCEPTED
    // alone, so an unvalidated status here is a self-accept.
    if (status !== undefined && !EDITABLE_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Whitelist formData keys server-side — applicants own this document but
    // must not be able to write arbitrary fields into it.
    const formData = body.formData ? sanitizeIncomingFormData(body.formData) : undefined;

    // preferredSystems drives reviewer visibility (array-contains queries) and
    // several .map/.join call sites, so it must be a real array of this team's
    // systems: a string or object here white-screens the applicant dashboard
    // and the staff detail view, and an off-team name hides the applicant
    // from every reviewer. An empty array is allowed (clearing the ranking).
    if (preferredSystems !== undefined) {
      const teamSystems = (TEAM_SYSTEMS[existingApplication.team] || []).map((s) => s.value);
      const valid =
        Array.isArray(preferredSystems) &&
        preferredSystems.length <= 3 &&
        new Set(preferredSystems).size === preferredSystems.length &&
        preferredSystems.every((s: unknown) => typeof s === "string" && teamSystems.includes(s));
      if (!valid) {
        return NextResponse.json(
          { error: "Preferred systems must be up to 3 distinct systems from your team" },
          { status: 400 }
        );
      }

      // Once any system has acted (an offer or a rejection) the ranking is
      // locked: changing it would revoke a reviewer's access mid-review and
      // move the every-ranked-system-rejected line (#113). The form sends the
      // unchanged ranking on every autosave, so only a change is refused.
      const reviewStarted =
        (existingApplication.rejectedBySystems?.length ?? 0) > 0 ||
        (existingApplication.interviewOffers?.length ?? 0) > 0 ||
        (existingApplication.trialOffers?.length ?? 0) > 0;
      const changed =
        JSON.stringify(preferredSystems) !== JSON.stringify(existingApplication.preferredSystems ?? []);
      if (reviewStarted && changed) {
        return NextResponse.json(
          { error: "Your system preferences are locked because review has started. Contact recruiting if they need to change." },
          { status: 400 }
        );
      }
    }

    // A submission with no ranked system is invisible to every system lead and
    // reviewer, so it cannot be reviewed. The form enforces this client-side;
    // this is the backstop for a stale cached form or a hand-rolled request.
    if (status === ApplicationStatus.SUBMITTED) {
      const finalSystems = preferredSystems ?? existingApplication.preferredSystems ?? [];
      if (finalSystems.length === 0) {
        return NextResponse.json(
          { error: "Rank at least one system before submitting" },
          { status: 400 }
        );
      }
    }

    // Validate word counts when submitting
    if (status === ApplicationStatus.SUBMITTED) {
      const mergedFormData = formData
        ? { ...existingApplication.formData, ...formData }
        : existingApplication.formData;

      try {
        const questionsConfig = await getApplicationQuestions();
        const team = existingApplication.team;
        const allQuestions = [
          ...questionsConfig.commonQuestions,
          ...(questionsConfig.teamQuestions[team] || []),
          ...Object.values(questionsConfig.systemQuestions || {}).flat(),
        ];

        const overLimitFields: string[] = [];
        for (const q of allQuestions) {
          if (q.maxWordCount && (q.type === "text" || q.type === "textarea")) {
            // An answer can live in a named field, the teamQuestions bag, or
            // the customAnswers bag (admin-added common questions).
            const value =
              (mergedFormData as Record<string, unknown>)?.[q.id] ||
              mergedFormData?.teamQuestions?.[q.id] ||
              mergedFormData?.customAnswers?.[q.id] ||
              "";
            if (typeof value === "string" && countWords(value) > q.maxWordCount) {
              overLimitFields.push(`${q.label} (max ${q.maxWordCount} words)`);
            }
          }
        }

        if (overLimitFields.length > 0) {
          return NextResponse.json(
            { error: `The following fields exceed the word limit: ${overLimitFields.join(", ")}` },
            { status: 400 }
          );
        }
      } catch (err) {
        logger.warn({ err }, "Could not validate word counts, proceeding without validation");
      }
    }

    let application;

    // Editing an application that is already submitted re-stamps submittedAt so
    // the date always reflects the version staff are looking at. Autosave means
    // this happens on every edit, not only when the applicant clicks the button.
    // (updateApplication sets submittedAt whenever status is set to SUBMITTED.)
    const alreadySubmitted =
      existingApplication.status === ApplicationStatus.SUBMITTED;

    // If only formData is being updated on a draft, use the merge function
    if (formData && !preferredSystems && !status && !alreadySubmitted) {
      application = await updateApplicationFormData(id, formData);
    } else {
      // Update all provided fields
      const updates: Record<string, unknown> = {};
      if (formData) updates.formData = { ...existingApplication.formData, ...formData };
      if (preferredSystems !== undefined) updates.preferredSystems = preferredSystems;
      const nextStatus = status || (alreadySubmitted ? ApplicationStatus.SUBMITTED : undefined);
      if (nextStatus) updates.status = nextStatus;

      application = await updateApplication(id, updates);
    }

    // Same rule as GET: nothing applicant-facing leaves this route unsanitized.
    return NextResponse.json(
      { application: application ? sanitizeApplicationForApplicant(application, config.currentStep) : null },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to update application");
    return NextResponse.json(
      { error: "Failed to update application" },
      { status: 500 }
    );
  }
}
