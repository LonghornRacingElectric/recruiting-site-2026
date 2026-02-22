"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ApplicationsProvider } from "./_components/ApplicationsContext";
import ApplicationsSidebar from "./_components/ApplicationsSidebar";

export default function AdminApplicationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  
  // Extract application ID from URL: /admin/applications/[id]
  const pathParts = pathname.split('/');
  const selectedApplicationId = pathParts.length > 3 ? pathParts[3] : undefined;
  
  return (
    <ApplicationsProvider selectedApplicationId={selectedApplicationId}>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden" style={{ background: '#030608' }}>
        <ApplicationsSidebar />
        {children}
      </div>
    </ApplicationsProvider>
  );
}
