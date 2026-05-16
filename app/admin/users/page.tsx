import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";
import { UsersPageClient } from "./_components/UsersPageClient";

const ALLOWED_ROLES = [UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB];

export default async function AdminUsersPage() {
  try {
    await requireRoles(ALLOWED_ROLES);
  } catch {
    // Same destination the admin layout uses when a non-staff user lands
    // here — sends them to the role-appropriate landing inside the admin
    // shell rather than to a scary error page.
    redirect("/admin/dashboard");
  }

  return <UsersPageClient />;
}
