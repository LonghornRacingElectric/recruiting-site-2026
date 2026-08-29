import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";
import { listAudit } from "@/lib/firebase/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit?action=&actor=&applicationId=&limit=
 * Recent staff activity, newest first. Admins see everything; team captains
 * see entries about their own team's applications (config and user changes
 * carry no application, so those stay admin-only).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoles([UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB]);
    const p = request.nextUrl.searchParams;
    const limit = Math.min(Number(p.get("limit")) || 200, 500);
    const scope: { team?: string } = {};
    if (user?.role === UserRole.TEAM_CAPTAIN_OB) {
      const team = user.memberProfile?.team;
      if (!team) return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
      scope.team = team;
    }
    const entries = await listAudit({
      ...scope,
      action: p.get("action") || undefined,
      actorUid: p.get("actor") || undefined,
      applicationId: p.get("applicationId") || undefined,
      limit,
    });
    // A captain asking for a specific application still only gets their team.
    const visible = scope.team ? entries.filter((e) => e.applicantTeam === scope.team) : entries;
    return NextResponse.json(
      { entries: visible.map((e) => ({ ...e, at: e.at.toISOString() })) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    logger.error({ err: error }, "Failed to load audit log");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
