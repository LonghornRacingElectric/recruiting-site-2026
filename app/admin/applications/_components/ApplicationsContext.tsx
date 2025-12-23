"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";

interface ApplicationWithUser extends Application {
  user: User;
  aggregateRating?: number | null;
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

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/applications");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.error("Failed to fetch applications", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        await fetchApps();
        
        // Fetch current user
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUser(userData.user);
        }
        
        // Fetch recruiting config
        const configRes = await fetch("/api/admin/config/recruiting");
        if (configRes.ok) {
          const configData = await configRes.json();
          setRecruitingStep(configData.config?.currentStep || null);
        }
      } catch (err) {
        console.error("Failed to initialize applications context", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchApps]);

  return (
    <ApplicationsContext.Provider value={{ 
      applications, 
      setApplications, 
      loading, 
      currentUser, 
      recruitingStep,
      refreshApplications: fetchApps
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
