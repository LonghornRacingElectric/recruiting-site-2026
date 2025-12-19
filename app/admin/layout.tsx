import { requireStaff } from "@/lib/auth/guard";
import { AdminShell } from "./AdminShell";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireStaff();
  } catch (error) {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
