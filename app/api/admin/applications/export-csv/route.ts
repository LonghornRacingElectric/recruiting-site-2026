import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { UserRole, Team } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { ScorecardSubmission } from "@/lib/models/Scorecard";
import { Note } from "@/lib/models/ApplicationExtras";
import pino from "pino";

const logger = pino();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
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
    // Build header row
    // -----------------------------------------------------------------------
    const staticHeaders = [
      "Name",
      "Email",
      "Team",
      "Preferred Systems",
      "Status",
      "Review Decision",
      "Interview Decision",
      "Trial Decision",
      "Graduation Year",
      "Major",
      "Why Join",
      "Relevant Experience",
      "Availability",
      "Resume URL",
      // Team-specific questions
      "Team Question 1",
      "Team Question 2",
      "Review Rating (Aggregate)",
      "Interview Rating (Aggregate)",
      "Interview Offers",
      "Trial Offers",
      "Offer System",
      "Offer Role",
      "Submitted At",
      "Created At",
    ];

    const scorecardHeaders = scorecardFieldKeys.map((k) => k.label);
    // Reviewer aggregates summary
    const reviewerSummaryHeaders = [
      "Scorecard Reviewers",
      "Notes",
    ];

    const allHeaders = [...staticHeaders, ...scorecardHeaders, ...reviewerSummaryHeaders];

    // -----------------------------------------------------------------------
    // Build data rows
    // -----------------------------------------------------------------------
    const rows: string[] = [buildRow(allHeaders)];

    for (const app of applications) {
      const fd = app.formData || {};
      const teamQs = fd.teamQuestions || {};
      const teamQValues = Object.values(teamQs);

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
        teamQValues[0] || "",
        teamQValues[1] || "",
        reviewRating,
        interviewRating,
        interviewOffersSummary,
        trialOffersSummary,
        app.offer?.system || "",
        app.offer?.role || "",
        formatDate(app.submittedAt),
        formatDate(app.createdAt),
      ];

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
      return NextResponse.json({ error: error.message }, { status: 403 });
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
  const results = await Promise.all(
    appIds.map(async (appId) => {
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
    })
  );

  return Object.fromEntries(results.map(({ appId, submissions }) => [appId, submissions]));
}

async function fetchAllNotes(
  appIds: string[]
): Promise<Record<string, Note[]>> {
  if (appIds.length === 0) return {};

  const results = await Promise.all(
    appIds.map(async (appId) => {
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
    })
  );

  return Object.fromEntries(results.map(({ appId, notes }) => [appId, notes]));
}
