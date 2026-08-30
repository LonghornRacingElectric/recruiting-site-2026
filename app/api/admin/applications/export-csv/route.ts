import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { UserRole, Team } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { ScorecardSubmission } from "@/lib/models/Scorecard";
import { Note } from "@/lib/models/ApplicationExtras";
import { getApplicationQuestions } from "@/lib/firebase/config";
import { getSystemQuestionKeyLabel } from "@/lib/models/teamQuestions";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Neutralize spreadsheet formulas. Excel and Sheets evaluate a cell starting
  // with any of these *after* the CSV parser has stripped the quoting below, so
  // quoting is no defense — and applicants write the free-text answers that end
  // up in this export. A leading apostrophe forces the cell to text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Wrap in quotes if it contains commas, quotes, or newlines
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildRow(values: unknown[]): string {
  return values.map(escapeCell).join(",");
}

function formatDate(d: Date | string | undefined | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

function docToApplication(doc: FirebaseFirestore.DocumentSnapshot): Application {
  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt) || new Date(),
    submittedAt: data.submittedAt?.toDate?.() || (data.submittedAt ? new Date(data.submittedAt) : undefined),
  } as Application;
}

// ---------------------------------------------------------------------------
// POST /api/admin/applications/export-csv
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { uid, user } = await requireStaff();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedTeams: string[] = body.teams || [];
    const requestedSystems: string[] = body.systems || [];

    const role: UserRole = user.role;
    const userTeam: string | undefined = user.memberProfile?.team;
    const userSystem: string | undefined = user.memberProfile?.system;

    // -----------------------------------------------------------------------
    // Build the Firestore query according to role
    // -----------------------------------------------------------------------
    let query: FirebaseFirestore.Query = adminDb.collection("applications");

    if (role === UserRole.ADMIN) {
      // Admin: honour requested teams/systems, or get everything
      if (requestedTeams.length === 1) {
        query = query.where("team", "==", requestedTeams[0]);
      } else if (requestedTeams.length > 1) {
        query = query.where("team", "in", requestedTeams);
      }
      // system filtering is done in JS after fetching (Firestore array-contains
      // doesn't combine well with `in` in a single query)
    } else if (role === UserRole.TEAM_CAPTAIN_OB) {
      if (!userTeam) {
        return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
      }
      query = query.where("team", "==", userTeam);
    } else if (role === UserRole.SYSTEM_LEAD) {
      if (!userTeam || !userSystem) {
        return NextResponse.json({ error: "System profile missing" }, { status: 403 });
      }
      query = query
        .where("team", "==", userTeam)
        .where("preferredSystems", "array-contains", userSystem);
    } else {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const snapshot = await query.get();
    let applications = snapshot.docs.map(docToApplication);

    // Filter out in-progress applications for non-admins (same rule as list API)
    if (role !== UserRole.ADMIN) {
      applications = applications.filter((a) => a.status !== "in_progress");
    }

    // Post-filter by requested systems (for Admin and Team Captain)
    if (
      (role === UserRole.ADMIN || role === UserRole.TEAM_CAPTAIN_OB) &&
      requestedSystems.length > 0
    ) {
      applications = applications.filter((a) => {
        const appSystems = a.preferredSystems || [];
        return appSystems.some((s) => requestedSystems.includes(s));
      });
    }

    if (applications.length === 0) {
      // Return empty CSV with just headers
      const csv = "Name,Email\n";
      {
      const exportedTeams = [...new Set(applications.map((a) => a.team))];
      await recordAudit(request, user, {
        action: "application.export",
        applicantTeam: exportedTeams.length === 1 ? exportedTeams[0] : undefined,
        after: { count: applications.length, teams: exportedTeams, systems: requestedSystems },
        detail: `${applications.length} applications exported (${exportedTeams.join(", ") || "none"})`,
      });
    }
    return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="applicants_export.csv"`,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Fetch scorecards and notes for all applications in parallel
    // -----------------------------------------------------------------------
    const appIds = applications.map((a) => a.id);

    const [scorecardsMap, notesMap] = await Promise.all([
      fetchAllScorecards(appIds),
      fetchAllNotes(appIds),
    ]);

    // -----------------------------------------------------------------------
    // Determine dynamic scorecard field columns
    // Each unique "{type} - {fieldLabel}" pair becomes a CSV column.
    // Key format: "{reviewerId}:{system}:{type}" → submission data
    // We enumerate all unique (scorecardType, system, fieldId, fieldLabel) tuples.
    // -----------------------------------------------------------------------
    interface ScorecardFieldKey {
      colKey: string;  // e.g. "review:Electronics:technical_ability"
      label: string;   // e.g. "Review (Electronics) - Technical Ability"
    }

    const scorecardFieldKeys: ScorecardFieldKey[] = [];
    const seenColKeys = new Set<string>();

    for (const appId of appIds) {
      const submissions = scorecardsMap[appId] || [];
      for (const sub of submissions) {
        const type = sub.scorecardType || "review";
        const system = sub.system || "General";
        for (const fieldId of Object.keys(sub.data)) {
          const colKey = `${type}:${system}:${fieldId}`;
          if (!seenColKeys.has(colKey)) {
            seenColKeys.add(colKey);
            const typeLabel = type === "interview" ? "Interview" : "Review";
            // We'll resolve field labels dynamically; use fieldId as fallback
            scorecardFieldKeys.push({
              colKey,
              label: `${typeLabel} (${system}) - ${fieldId}`,
            });
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Determine dynamic columns for admin-added common questions.
    // These are stored in formData.customAnswers keyed by question id; the
    // label comes from the questions config so the column header reads the
    // way the admin wrote it.
    // -----------------------------------------------------------------------
    const customAnswerIds: string[] = [];
    for (const app of applications) {
      for (const qId of Object.keys(app.formData?.customAnswers || {})) {
        if (!customAnswerIds.includes(qId)) customAnswerIds.push(qId);
      }
    }

    let customAnswerLabels: Record<string, string> = {};
    if (customAnswerIds.length > 0) {
      try {
        const questionsConfig = await getApplicationQuestions();
        // customAnswers holds both admin-added common questions and
        // system-specific ones, so resolve labels from both.
        customAnswerLabels = Object.fromEntries([
          ...questionsConfig.commonQuestions.map((q) => [q.id, q.label]),
          ...Object.entries(questionsConfig.systemQuestions || {}).flatMap(
            ([systemKey, questions]) =>
              (questions || []).map((q) => [q.id, `${q.label} (${getSystemQuestionKeyLabel(systemKey)})`])
          ),
        ]);
      } catch (err) {
        logger.warn({ err }, "Could not load question labels for CSV export");
      }
    }

    // -----------------------------------------------------------------------
    // Build header row
    // -----------------------------------------------------------------------
    const staticHeaders = [
      "Name",
      "Email",
      "Team",
      "Preferred Systems",
      // The ranking as the applicant set it, before an interview selection or
      // an unranked offer narrowed preferredSystems (#73).
      "Original Preferred Systems",
      "Status",
      "Review Decision",
      "Interview Decision",
      "Trial Decision",
      "Graduation Year",
      "Major",
      "Why Join",
      "Relevant Experience",
      // Heads up: the live config relabelled the "availability" question to
      // "Phone Number", so this column holds phone numbers for anyone who
      // applied after 2026-04-28. See lib/utils/formAnswers.ts.
      "Availability",
      "Resume URL",
      "Portfolio URL",
      "Review Rating (Aggregate)",
      "Interview Rating (Aggregate)",
      "Interview Offers",
      "Trial Offers",
      "Offer System",
      "Offer Role",
      "Submitted At",
      "Created At",
    ];

    const customAnswerHeaders = customAnswerIds.map(
      (qId) => customAnswerLabels[qId] || qId
    );
    const scorecardHeaders = scorecardFieldKeys.map((k) => k.label);
    // Reviewer aggregates summary
    const reviewerSummaryHeaders = [
      "Scorecard Reviewers",
      "Notes",
    ];

    // Team-question columns keyed off the config (#73): one column per team
    // question, for every team in the export, so a blank optional first answer
    // no longer shifts the rest and nothing past the second is dropped.
    const questionsForColumns = await getApplicationQuestions();
    const teamsInExport = new Set(applications.map((a) => a.team));
    const teamQuestionCols = Object.entries(questionsForColumns.teamQuestions)
      .filter(([team]) => teamsInExport.has(team as Team))
      .flatMap(([team, qs]) => (qs || []).map((q) => ({ team, id: q.id, label: q.label })));
    // Answers stored under a question id the config no longer has (a question
    // deleted or re-created mid-cycle) still export, in one catch-all column.
    const teamQuestionHeaders = [...teamQuestionCols.map((col) => `${col.team} Q: ${col.label}`), "Other Team Answers"];
    const allHeaders = [
      ...staticHeaders,
      ...customAnswerHeaders,
      ...teamQuestionHeaders,
      ...scorecardHeaders,
      ...reviewerSummaryHeaders,
    ];

    // -----------------------------------------------------------------------
    // Build data rows
    // -----------------------------------------------------------------------
    const rows: string[] = [buildRow(allHeaders)];

    for (const app of applications) {
      const fd = app.formData || {};
      const teamQs = fd.teamQuestions || {};
      const teamQuestionValues = [
        ...teamQuestionCols.map((col) => (app.team === col.team ? teamQs[col.id] || "" : "")),
        Object.entries(teamQs)
          .filter(([id, v]) => v && !teamQuestionCols.some((col) => col.team === app.team && col.id === id))
          .map(([id, v]) => `${id}: ${v}`)
          .join(" | "),
      ];

      // Determine the target system for aggregate ratings
      // For system leads, use their system; otherwise first preferred system
      const targetSystem =
        role === UserRole.SYSTEM_LEAD
          ? userSystem
          : app.preferredSystems?.[0];

      const systemRatings =
        targetSystem && app.aggregateRatings
          ? app.aggregateRatings[targetSystem]
          : undefined;

      const reviewRating =
        systemRatings?.reviewRating != null
          ? String(systemRatings.reviewRating)
          : "";
      const interviewRating =
        systemRatings?.interviewRating != null
          ? String(systemRatings.interviewRating)
          : "";

      // Interview offers summary
      const interviewOffersSummary = (app.interviewOffers || [])
        .map((o) => `${o.system} (${o.status})`)
        .join("; ");

      // Trial offers summary
      const trialOffersSummary = (app.trialOffers || [])
        .map((o) => {
          const resp = o.accepted === true ? "Accepted" : o.accepted === false ? "Declined" : "Pending";
          return `${o.system} (${resp})`;
        })
        .join("; ");

      const staticValues: unknown[] = [
        app.userName || "",
        app.userEmail || "",
        app.team,
        (app.preferredSystems || []).join("; "),
        (app.originalPreferredSystems || []).join("; "),
        app.status,
        app.reviewDecision || "",
        app.interviewDecision || "",
        app.trialDecision || "",
        fd.graduationYear || "",
        fd.major || "",
        fd.whyJoin || "",
        fd.relevantExperience || "",
        fd.availability || "",
        fd.resumeUrl || "",
        fd.portfolioUrl || "",
        reviewRating,
        interviewRating,
        interviewOffersSummary,
        trialOffersSummary,
        app.offer?.system || "",
        app.offer?.role || "",
        formatDate(app.submittedAt),
        formatDate(app.createdAt),
      ];

      // Admin-added common question answers, in the same order as their headers
      const customAnswerValues: string[] = customAnswerIds.map(
        (qId) => fd.customAnswers?.[qId] || ""
      );

      // Scorecard field values (flattened)
      const submissions = scorecardsMap[app.id] || [];
      const scorecardValues: string[] = scorecardFieldKeys.map(({ colKey }) => {
        const [type, system, fieldId] = colKey.split(":");
        const matchingSubs = submissions.filter(
          (s) =>
            (s.scorecardType || "review") === type &&
            (s.system || "General") === system
        );
        if (matchingSubs.length === 0) return "";
        // Aggregate all reviewer values for this field
        const parts = matchingSubs
          .map((s) => {
            const val = s.data[fieldId];
            if (val === undefined || val === null) return null;
            const name = s.reviewerName || "Reviewer";
            return `${name}: ${val}`;
          })
          .filter(Boolean) as string[];
        return parts.join(" | ");
      });

      // Reviewer summary
      const reviewerNames = [
        ...new Set(submissions.map((s) => s.reviewerName || "Unknown")),
      ].join(", ");

      // Notes
      const notes = notesMap[app.id] || [];
      const notesSummary = notes
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        .map((n) => {
          const dateStr = formatDate(n.createdAt);
          const author = n.authorName || "Unknown";
          const content = n.content || "";
          return `[${dateStr}] ${author}: ${content}`;
        })
        .join("\n");

      const row = [
        ...staticValues,
        ...customAnswerValues,
        ...teamQuestionValues,
        ...scorecardValues,
        reviewerNames,
        notesSummary,
      ];
      rows.push(buildRow(row));
    }

    const csv = rows.join("\n");

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `applicants_export_${timestamp}.csv`;

    {
      const exportedTeams = [...new Set(applications.map((a) => a.team))];
      await recordAudit(request, user, {
        action: "application.export",
        applicantTeam: exportedTeams.length === 1 ? exportedTeams[0] : undefined,
        after: { count: applications.length, teams: exportedTeams, systems: requestedSystems },
        detail: `${applications.length} applications exported (${exportedTeams.join(", ") || "none"})`,
      });
    }
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error(error, "Failed to export CSV");
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message.includes("Forbidden"))
    ) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Sub-collection fetchers
// ---------------------------------------------------------------------------

async function fetchAllScorecards(
  appIds: string[]
): Promise<Record<string, ScorecardSubmission[]>> {
  if (appIds.length === 0) return {};

  // Fetch scorecards for all apps in parallel (up to 50 concurrent)
  const results = await mapInChunks(appIds, 25, async (appId) => {
      const snapshot = await adminDb
        .collection("applications")
        .doc(appId)
        .collection("scorecards")
        .get();

      const submissions: ScorecardSubmission[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        } as ScorecardSubmission;
      });

      return { appId, submissions };
  });

  return Object.fromEntries(results.map(({ appId, submissions }) => [appId, submissions]));
}

/** Bounded fan-out (#73): N subcollection reads at a time, not all of them at once. */
async function mapInChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function fetchAllNotes(
  appIds: string[]
): Promise<Record<string, Note[]>> {
  if (appIds.length === 0) return {};

  const results = await mapInChunks(appIds, 25, async (appId) => {
      const snapshot = await adminDb
        .collection("applications")
        .doc(appId)
        .collection("notes")
        .orderBy("createdAt", "asc")
        .get();

      const notes: Note[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
        } as Note;
      });

      return { appId, notes };
  });

  return Object.fromEntries(results.map(({ appId, notes }) => [appId, notes]));
}
