import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";
import { ActivityView } from "./ActivityView";

export const metadata: Metadata = { title: "Activity" };

// Admins and team captains only — the nav hides the link, the URL doesn't.
export default async function AdminActivityPage() {
  try {
    await requireRoles([UserRole.ADMIN, UserRole.TEAM_CAPTAIN_OB]);
  } catch {
    redirect("/admin/dashboard");
  }
  return <ActivityView />;
}
