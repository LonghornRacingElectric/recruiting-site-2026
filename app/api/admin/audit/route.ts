import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";
import { listAudit, countAudit, isVisibleToTeam } from "@/lib/firebase/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit?action=&actor=&applicationId=&limit=&before=&beforeId=
 * Recent staff activity, newest first. Admins see everything; team captains
 * see entries about their own team's applications (config and user changes
 * carry no application, so those stay admin-only).
 *
 * Paged: the response carries `hasMore` and `nextCursor` ({at, id}); pass
 * them back as `before` / `beforeId` for the next page. The first page also
 * carries `total`, an exact count for the scope (null when it would need a
 * composite index: a captain with an action filter).
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
    const action = p.get("action") || undefined;
    const beforeAt = p.get("before"), beforeId = p.get("beforeId");
    const before = beforeAt && beforeId && !Number.isNaN(new Date(beforeAt).getTime()) ? { at: new Date(beforeAt), id: beforeId } : undefined;
    const [{ entries, truncated, hasMore, nextCursor }, total] = await Promise.all([
      listAudit({
        ...scope,
        action,
        actorUid: p.get("actor") || undefined,
        applicationId: p.get("applicationId") || undefined,
        limit,
        before,
      }),
      before ? Promise.resolve(undefined) : countAudit({ ...scope, action }),
    ]);
    // A captain asking for a specific application still only gets their team.
    const visible = scope.team ? entries.filter((e) => isVisibleToTeam(e, scope.team!)) : entries;
    return NextResponse.json(
      {
        entries: visible.map((e) => ({ ...e, at: e.at.toISOString() })),
        truncated,
        hasMore,
        nextCursor: nextCursor ? { at: nextCursor.at.toISOString(), id: nextCursor.id } : null,
        ...(before ? {} : { total }),
      },
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
