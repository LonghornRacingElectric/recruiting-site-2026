import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guard";
import { StatsView } from "./StatsView";

export const metadata: Metadata = { title: "Stats" };

// The admin layout already gates on staff; the explicit call here is the
// house rule (every admin page guards itself) and keeps the page safe if the
// layout ever changes.
export default async function AdminStatsPage() {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/dashboard");
  }
  return <StatsView />;
}
