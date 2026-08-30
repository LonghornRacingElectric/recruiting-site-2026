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
import { sanitizeIncomingFormData, missingRequiredAnswers } from "@/lib/utils/formAnswers";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { logger } from "@/lib/logger";


/**
 * `baseEditAt` as the form sends it — an ISO string — or, defensively, an
 * epoch number or a serialized Firestore Timestamp. `null`/absent means the
 * client had no base (a fresh application). Anything else is a client bug and
 * must be refused rather than read as "base 0", which would look like a
 * conflict and throw the applicant's typing away.
 */
function baseEditMillis(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "object") {
    const o = v as { _seconds?: unknown; seconds?: unknown };
    const secs = typeof o._seconds === "number" ? o._seconds : typeof o.seconds === "number" ? o.seconds : undefined;
    if (secs !== undefined) return secs * 1000;
  }
  return null;
}

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
    // can't change under a reviewer).
    //
    // A REJECTED application stays editable too, on purpose. Every rejection
    // made while applications are open is masked until release_interviews, so
    // a frozen form would tell the applicant a decision exists while their
    // peers keep editing. Their edits can't reach that decision: `status` is
    // never written for a rejected application (see nextStatus below), so the
    // rejection and its decision fields survive the save untouched.
    //
    // INTERVIEW is locked: a lead who advances during `open` (#118) acts on
    // the form as it stands, and the interview offer references the ranking.
    const APPLICANT_STATUSES: ApplicationStatus[] = [
      ApplicationStatus.IN_PROGRESS,
      ApplicationStatus.SUBMITTED,
    ];
    const EDITABLE_STATUSES: ApplicationStatus[] = [
      ...APPLICANT_STATUSES,
      ApplicationStatus.REJECTED,
    ];
    if (!EDITABLE_STATUSES.includes(existingApplication.status)) {
      return NextResponse.json(
        { error: "This application can no longer be edited" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { preferredSystems, status, editSession, baseEditAt } = body;

    // An applicant may only move their own application between the two statuses
    // they own. This value reaches Firestore unmodified, and nothing downstream
    // re-derives how it got there — `POST /commit` gates on status === ACCEPTED
    // alone, so an unvalidated status here is a self-accept.
    if (status !== undefined && !APPLICANT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Two tabs, one application (#127). Each tab identifies itself and says
    // which version it last saw. A save from a tab that is not the last
    // editor, made after another tab saved, is refused with 409 and the form
    // reloads — an older copy must never overwrite a newer one (that is how
    // a submitted application lost its resume on Aug 28). The same tab is
    // never refused, so an in-flight save racing its own follow-up is fine,
    // and a client that sends no session (an older cached form) is accepted
    // as before.
    const session = typeof editSession === "string" && editSession.length > 0 && editSession.length <= 64 ? editSession : undefined;
    const baseMs = baseEditMillis(baseEditAt);
    if (baseMs === null) {
      return NextResponse.json({ error: "Invalid baseEditAt" }, { status: 400 });
    }
    if (session && existingApplication.lastEditSession && existingApplication.lastEditSession !== session) {
      const base = baseMs ?? 0;
      const last = existingApplication.lastEditAt?.getTime() ?? 0;
      if (last > base) {
        return NextResponse.json(
          { error: "This application was edited in another tab or on another device. Reload to continue from the latest version." },
          { status: 409 }
        );
      }
    }
    const editStamp = session ? { lastEditSession: session, lastEditAt: new Date() } : {};

    // Whitelist formData keys server-side — applicants own this document but
    // must not be able to write arbitrary fields into it. Per-answer caps live
    // in the sanitizer (#74); this bounds what the document would hold after
    // the merge (a bag absent from this request survives from the last one)
    // well under Firestore's 1 MB limit. The merge is a shallow spread that
    // replaces each bag wholesale — keep it that way.
    const formData = body.formData ? sanitizeIncomingFormData(body.formData) : undefined;
    if (formData && Buffer.byteLength(JSON.stringify({ ...existingApplication.formData, ...formData }), "utf8") > 600_000) {
      return NextResponse.json({ error: "Your answers are too long to save — please shorten them" }, { status: 400 });
    }

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

    // Required answers are enforced on submit here too (#127), not only by
    // the form: a stale question cache, a form that never rendered a newly
    // required question, or a hand-rolled request must not produce a
    // submitted application without a resume. The client shows this message
    // verbatim. (getApplicationQuestions() falls back to the code defaults on
    // a read failure, as the word-count check below already relies on.)
    //
    // Deliberately *only* on submit. Later edits to a submitted application
    // are the applicant's own, including ones that leave it incomplete
    // (removing the resume, emptying the ranking) — as before this change.
    // Applying the rule to every autosave wedged the form on exactly those
    // edits (review on #128); the form warns instead, and reviewers see the
    // gap.
    if (status === ApplicationStatus.SUBMITTED) {
      const questionsConfig = await getApplicationQuestions();
      const mergedFormData = formData
        ? { ...existingApplication.formData, ...formData }
        : existingApplication.formData;
      const mergedSystems: string[] = preferredSystems ?? existingApplication.preferredSystems ?? [];
      const missing = missingRequiredAnswers(mergedFormData, mergedSystems, existingApplication.team, questionsConfig);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Please fill in the following required fields: ${missing.join(", ")}` },
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
    // Never write `status` for a rejected application: a save from the form —
    // including its Submit button — must not turn a masked rejection back into
    // "submitted".
    const isRejected = existingApplication.status === ApplicationStatus.REJECTED;

    // If only formData is being updated on a draft, use the merge function
    if (formData && !preferredSystems && !status && !alreadySubmitted) {
      application = await updateApplicationFormData(id, formData, editStamp);
    } else {
      // Update all provided fields
      const updates: Record<string, unknown> = { ...editStamp };
      if (formData) updates.formData = { ...existingApplication.formData, ...formData };
      if (preferredSystems !== undefined) updates.preferredSystems = preferredSystems;
      const nextStatus = isRejected
        ? undefined
        : status || (alreadySubmitted ? ApplicationStatus.SUBMITTED : undefined);
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
