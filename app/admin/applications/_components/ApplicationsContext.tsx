"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";

interface ApplicationWithUser extends Application {
  user: User;
}

interface ApplicationsContextType {
  applications: ApplicationWithUser[];
  setApplications: React.Dispatch<React.SetStateAction<ApplicationWithUser[]>>;
  loading: boolean;
  currentUser: User | null;
  recruitingStep: RecruitingStep | null;
  refreshApplications: () => Promise<void>;
}

const ApplicationsContext = createContext<ApplicationsContextType | undefined>(undefined);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [recruitingStep, setRecruitingStep] = useState<RecruitingStep | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Single combined endpoint for all init data
      const res = await fetch("/api/admin/init");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        setCurrentUser(data.user || null);
        setRecruitingStep(data.recruitingStep || null);
      }
    } catch (err) {
      console.error("Failed to fetch admin init data", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        await fetchData();
      } catch (err) {
        console.error("Failed to initialize applications context", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchData]);

  return (
    <ApplicationsContext.Provider value={{ 
      applications, 
      setApplications, 
      loading, 
      currentUser, 
      recruitingStep,
      refreshApplications: fetchData
    }}>
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications() {
  const context = useContext(ApplicationsContext);
  if (context === undefined) {
    throw new Error("useApplications must be used within an ApplicationsProvider");
  }
  return context;
}
