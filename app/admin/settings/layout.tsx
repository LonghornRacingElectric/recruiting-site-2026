import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/auth/guard";
import { UserRole } from "@/lib/models/User";

// Every action on the Settings page (recruiting step, email triggers, reneg
// switch, announcement, fake-data seeding) is admin-only server-side. The nav
// link is admin-only too, but the URL is not — gate the page itself so
// non-admin staff never see a page where every button 403s.
export default async function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireRoles([UserRole.ADMIN]);
  } catch {
    redirect("/admin/dashboard");
  }

  return <>{children}</>;
}
