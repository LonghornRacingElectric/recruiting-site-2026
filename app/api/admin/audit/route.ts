import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";
import { listAudit, countAudit, isVisibleToTeam } from "@/lib/firebase/audit";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit?action=&actor=&applicationId=&limit=&beforeSeconds=&beforeNanos=&beforeId=
 * Recent staff activity, newest first. Admins see everything; team captains
 * see entries about their own team's applications (config and user changes
 * carry no application, so those stay admin-only).
 *
 * Paged: the response carries `hasMore` and `nextCursor` ({seconds, nanos,
 * id} — the raw timestamp, never an ISO string: milliseconds are not enough
 * to place a cursor inside a bulk batch); pass it back as `beforeSeconds` /
 * `beforeNanos` / `beforeId` for the next page. The first page also carries
 * `total`, an exact count for the scope (null when it can't be counted
 * cheaply — a captain with an action filter — or when the count failed; the
 * feed itself never depends on it).
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
    const bs = p.get("beforeSeconds"), bn = p.get("beforeNanos"), beforeId = p.get("beforeId");
    let before: { at: Timestamp; id: string } | undefined;
    if (bs !== null || bn !== null || beforeId !== null) {
      const seconds = Number(bs), nanos = Number(bn);
      const valid =
        Number.isInteger(seconds) && seconds >= 0 &&
        Number.isInteger(nanos) && nanos >= 0 && nanos < 1_000_000_000 &&
        !!beforeId && beforeId.length <= 128 && !beforeId.includes("/");
      if (!valid) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      before = { at: new Timestamp(seconds, nanos), id: beforeId! };
    }
    const [{ entries, truncated, hasMore, nextCursor }, total] = await Promise.all([
      listAudit({
        ...scope,
        action,
        actorUid: p.get("actor") || undefined,
        applicationId: p.get("applicationId") || undefined,
        limit,
        before,
      }),
      before
        ? Promise.resolve(undefined)
        : countAudit({ ...scope, action }).catch((err) => {
            logger.error({ err }, "Failed to count audit entries");
            return null;
          }),
    ]);
    // A captain asking for a specific application still only gets their team.
    const visible = scope.team ? entries.filter((e) => isVisibleToTeam(e, scope.team!)) : entries;
    return NextResponse.json(
      {
        entries: visible.map((e) => ({ ...e, at: e.at.toISOString() })),
        truncated,
        hasMore,
        nextCursor: nextCursor ? { seconds: nextCursor.at.seconds, nanos: nextCursor.at.nanoseconds, id: nextCursor.id } : null,
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
