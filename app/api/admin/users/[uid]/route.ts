import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { updateUser } from "@/lib/firebase/users";
import { UserRole } from "@/lib/models/User";
import { FieldValue } from "firebase-admin/firestore";
import pino from "pino";

const logger = pino();

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
  try {
    ({ user: currentUser } = await requireStaff());
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

    if (role) {
      // Only Admins can update roles
      if (currentUser?.role !== UserRole.ADMIN) {
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

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Failed to update user");
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
