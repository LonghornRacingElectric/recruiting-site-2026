import { NextRequest, NextResponse } from "next/server";
import { requireStaff, guardErrorStatus } from "@/lib/auth/guard";
import { getAllUsers } from "@/lib/firebase/users";
import { UserRole } from "@/lib/models/User";
import { logger } from "@/lib/logger";


const ALLOWED_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.TEAM_CAPTAIN_OB,
]);

/**
 * GET /api/admin/users
 * Returns the full user list for the admin Users management page.
 * Restricted to roles that can see the /admin/users UI (ADMIN + TEAM_CAPTAIN_OB).
 */
export async function GET(_request: NextRequest) {
  let user;
  try {
    ({ user } = await requireStaff());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ALLOWED_ROLES.has(user?.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await getAllUsers();
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    const guardStatus = guardErrorStatus(error);
    if (guardStatus) return NextResponse.json({ error: (error as Error).message }, { status: guardStatus });
    logger.error({ err: error }, "Failed to get users");
    return NextResponse.json(
      { error: "Failed to get users" },
      { status: 500 }
    );
  }
}
