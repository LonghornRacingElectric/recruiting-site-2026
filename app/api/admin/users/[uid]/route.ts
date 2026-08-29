import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { updateUser, getUser } from "@/lib/firebase/users";
import { UserRole, Team } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


const ALLOWED_CALLER_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.TEAM_CAPTAIN_OB,
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  // Require an authenticated staff caller. Matches the UI gate on the
  // /admin/users page (ADMIN + TEAM_CAPTAIN_OB). Previously this only
  // verified the session cookie, allowing any authenticated user
  // (including applicants) to mutate other users' team/system/isMember.
  let currentUser;
  let callerUid = "";
  try {
    ({ uid: callerUid, user: currentUser } = await requireStaff());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ALLOWED_CALLER_ROLES.has(currentUser?.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { role, team, system, isMember } = body;
    const { uid: targetUid } = await params;

    const updateData: Record<string, unknown> = {};

    const target = await getUser(targetUid);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Every scoping check in the app keys off memberProfile.team, so this
    // field is an access-control boundary, not a profile detail. Captains may
    // manage their own team's roster only: users already on their team, or
    // users with no team yet, and never themselves or a move to another team.
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    if (!isAdmin) {
      const captainTeam = currentUser?.memberProfile?.team;
      if (!captainTeam) {
        return NextResponse.json({ error: "Your account has no team assigned" }, { status: 403 });
      }
      if (targetUid === callerUid) {
        return NextResponse.json({ error: "You cannot change your own membership" }, { status: 403 });
      }
      const targetTeam = target.memberProfile?.team;
      if (targetTeam && targetTeam !== captainTeam) {
        return NextResponse.json({ error: "You can only manage users on your own team" }, { status: 403 });
      }
      if (team && team !== captainTeam) {
        return NextResponse.json({ error: "You cannot move users to another team" }, { status: 403 });
      }
    }

    if (team) {
      if (!Object.values(Team).includes(team)) {
        return NextResponse.json({ error: "Invalid team" }, { status: 400 });
      }
      if (system && !TEAM_SYSTEMS[team as Team].some((s) => s.value === system)) {
        return NextResponse.json({ error: `Invalid system for team ${team}` }, { status: 400 });
      }
    }

    // The edit form sends the target's current role with every save, so an
    // unchanged role is a no-op; only an actual change is admin-only. (Until
    // this check compared against the stored role, every captain save was
    // refused here regardless of what they had changed.)
    if (role && role !== target.role) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only admins can update roles" }, { status: 403 });
      }

      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updateData.role = role;
    }

    if (isMember !== undefined) {
      updateData.isMember = isMember;
    }

    if (team) {
      updateData['memberProfile.team'] = team;
      updateData['memberProfile.system'] = system || null;
      updateData.isMember = true;
    } else if (team === null || team === "") {
      updateData.isMember = false;
      updateData.memberProfile = FieldValue.delete();
    }

    await updateUser(targetUid, updateData);

    await recordAudit(request, currentUser, {
      action: "user.update",
      targetUid,
      before: { role: target.role, team: target.memberProfile?.team, system: target.memberProfile?.system, isMember: target.isMember },
      after: { role: updateData.role ?? target.role, team, system, isMember },
      detail: `updated ${Object.keys(updateData).join(", ")}`,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to update user");
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
