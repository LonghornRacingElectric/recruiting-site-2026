import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guard";
import { AdminShell } from "./AdminShell";
import { ViewerProvider } from "./_components/ViewerContext";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let uid: string | null = null;
  try {
    ({ uid } = await requireStaff());
  } catch (error) {
    redirect("/dashboard");
  }

  return (
    <ViewerProvider uid={uid}>
      <AdminShell>{children}</AdminShell>
    </ViewerProvider>
  );
}
