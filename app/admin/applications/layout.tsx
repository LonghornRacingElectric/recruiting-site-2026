"use client";

import { ReactNode } from "react";
import { ApplicationsProvider } from "./_components/ApplicationsContext";
import ApplicationsSidebar from "./_components/ApplicationsSidebar";

export default function AdminApplicationsLayout({ children }: { children: ReactNode }) {
  return (
    <ApplicationsProvider>
      <div className="flex h-[calc(100vh-64px)] bg-neutral-950 overflow-hidden">
        <ApplicationsSidebar />
        {children}
      </div>
    </ApplicationsProvider>
  );
}
