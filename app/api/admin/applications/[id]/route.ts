import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { Team } from "@/lib/models/User";
import { logger } from "@/lib/logger";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";


/**
 * PATCH /api/admin/applications/[id]
 * Update application fields (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    
    const body = await request.json();
    const { team, preferredSystems, formData } = body;

    const docRef = adminDb.collection("applications").doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const currentData = doc.data();
    
    // Build update object
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    // Update team if provided and valid
    if (team && Object.values(Team).includes(team)) {
      updates.team = team;
    }

    // preferredSystems drives reviewer visibility and several .map/.join call
    // sites; the applicant route validates its shape and this one didn't (#115).
    // The edit modal resends the stored ranking alongside unrelated edits, so
    // only a changed value is validated — a legacy off-team entry must not
    // block a graduation-year fix.
    const rankingChanged =
      preferredSystems !== undefined &&
      JSON.stringify(preferredSystems) !== JSON.stringify(currentData?.preferredSystems ?? []);
    const teamChanged = updates.team !== undefined && updates.team !== currentData?.team;
    // A team change must not leave the old team's ranking behind either: the
    // ranking scopes reviewer visibility, so an Electric ranking on a Solar
    // application is invisible to every Solar lead.
    if (rankingChanged || teamChanged) {
      const forTeam = (updates.team ?? currentData?.team) as Team;
      const ranking = preferredSystems !== undefined ? preferredSystems : (currentData?.preferredSystems ?? []);
      const teamSystems = (TEAM_SYSTEMS[forTeam] || []).map((s) => s.value);
      const valid =
        Array.isArray(ranking) &&
        ranking.length <= 3 &&
        // Clearing the ranking on the same team stays allowed (matches the
        // applicant route), but a team change must arrive with a ranking for
        // the new team — an empty one is as invisible to its leads as an
        // off-team one.
        (!teamChanged || ranking.length > 0) &&
        new Set(ranking).size === ranking.length &&
        ranking.every((s: unknown) => typeof s === "string" && teamSystems.includes(s));
      if (!valid) {
        return NextResponse.json(
          { error: `Preferred systems must be up to 3 distinct ${forTeam ?? "team"} systems${teamChanged ? " — set a ranking for the new team in the same edit" : ""}` },
          { status: 400 }
        );
      }
      if (preferredSystems !== undefined) updates.preferredSystems = preferredSystems;
    }

    // Update form data fields if provided
    if (formData) {
      const currentFormData = currentData?.formData || {};
      updates.formData = {
        ...currentFormData,
        ...formData,
      };
    }

    await docRef.update(updates);

    // Fetch updated application
    const updatedDoc = await docRef.get();
    const application = { id: updatedDoc.id, ...updatedDoc.data() };

    return NextResponse.json({ application }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to update application");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Admin")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
