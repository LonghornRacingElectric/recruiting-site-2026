"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from "react";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";

interface ApplicationWithUser extends Application {
  user: User;
  aggregateRating?: number | null;
  interviewAggregateRating?: number | null;
  otherTeams?: Array<{ id: string; team: string; status: string; preferredSystems: string[] }>;
}

type SortBy = "date" | "name" | "rating" | "interviewRating";
type SortDirection = "asc" | "desc";

type BulkAction = "accept" | "reject" | "waitlist" | "interview" | "trial" | "submitted";

interface BulkActionResult {
  id: string;
  success: boolean;
  error?: string;
}

interface BulkActionResponse {
  results: BulkActionResult[];
  summary: { total: number; success: number; failed: number };
}

interface ApplicationsContextType {
  applications: ApplicationWithUser[]; // This will now be the FILTERED and SORTED list for the UI
  allApplications: ApplicationWithUser[]; // The full raw list
  setApplications: React.Dispatch<React.SetStateAction<ApplicationWithUser[]>>;
  loading: boolean;
  refetching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  currentUser: User | null;
  recruitingStep: RecruitingStep | null;
  refreshApplications: () => Promise<void>;
  loadMore: () => Promise<void>;
  ensureApplicationLoaded: (appId: string) => Promise<void>;
  bulkUpdateStatus: (ids: string[], action: BulkAction, systems?: string[]) => Promise<BulkActionResponse>;
  // Sort state
  sortBy: SortBy;
  sortDirection: SortDirection;
  setSortBy: (sortBy: SortBy) => void;
  setSortDirection: (direction: SortDirection) => void;
  // Search state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const ApplicationsContext = createContext<ApplicationsContextType | undefined>(undefined);

interface ApplicationsProviderProps {
  children: ReactNode;
  selectedApplicationId?: string;
}

// Local storage caching
// Meant to speed up loading times/reduce load on firestore
const CACHE_KEY = "admin_applications_cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedData {
  applications: ApplicationWithUser[];
  timestamp: number;
}

export function ApplicationsProvider({ children, selectedApplicationId }: ApplicationsProviderProps) {
  const [allApplications, setAllApplications] = useState<ApplicationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [recruitingStep, setRecruitingStep] = useState<RecruitingStep | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const initialLoadDone = useRef(false);

  // Fetch all applications once
  const fetchAllApps = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/admin/applications?all=true`);
      if (res.ok) {
        const data = await res.json();
        const apps = data.applications || [];
        setAllApplications(apps);

        // Update cache
        const cacheData: CachedData = {
          applications: apps,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

        return apps;
      }
      return [];
    } catch (err) {
      console.error("Failed to fetch applications", err);
      return [];
    }
  }, []);

  // Fetch a specific application by ID (details)
  const fetchSingleApp = useCallback(async (appId: string): Promise<ApplicationWithUser | null> => {
    try {
      const res = await fetch(`/api/admin/applications/${appId}/details`);
      if (res.ok) {
        const data = await res.json();
        return data.application || null;
      }
      return null;
    } catch (err) {
      console.error("Failed to fetch single application", err);
      return null;
    }
  }, []);

  // Ensure a specific application is in the list (used when navigating directly to an app URL)
  const ensureApplicationLoaded = useCallback(async (appId: string) => {
    // Check if already in list
    const alreadyInList = allApplications.some(a => a.id === appId);
    if (alreadyInList) return;

    const selectedApp = await fetchSingleApp(appId);
    if (selectedApp) {
      setAllApplications(prev => {
        if (prev.some(a => a.id === appId)) return prev;
        return [selectedApp, ...prev];
      });
    }
  }, [allApplications, fetchSingleApp]);

  const refreshApplications = useCallback(async () => {
    setRefetching(true);
    await fetchAllApps(true);
    setRefetching(false);
  }, [fetchAllApps]);

  const bulkUpdateStatus = useCallback(async (ids: string[], action: BulkAction, systems?: string[]): Promise<BulkActionResponse> => {
    try {
      const res = await fetch('/api/admin/applications/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationIds: ids, action, systems }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Bulk action failed');
      }
      const data: BulkActionResponse = await res.json();
      // Refresh the list after bulk action
      await refreshApplications();
      return data;
    } catch (err) {
      console.error('Bulk action failed', err);
      throw err;
    }
  }, [refreshApplications]);

  // Client-side search and sort
  const processedApplications = useMemo(() => {
    // 1. Filter by search term
    let filtered = allApplications;
    if (searchTerm) {
      const lowTerm = searchTerm.toLowerCase();
      filtered = allApplications.filter(app => {
        const name = app.user?.name?.toLowerCase() || "";
        const email = app.user?.email?.toLowerCase() || "";
        return name.includes(lowTerm) || email.includes(lowTerm);
      });
    }

    // 2. Sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date": {
          const aDate = new Date(a.createdAt).getTime();
          const bDate = new Date(b.createdAt).getTime();
          comparison = aDate - bDate;
          break;
        }
        case "name": {
          const aName = a.user?.name?.toLowerCase() || "";
          const bName = b.user?.name?.toLowerCase() || "";
          comparison = aName.localeCompare(bName);
          break;
        }
        case "rating": {
          const aRating = a.aggregateRating ?? -1;
          const bRating = b.aggregateRating ?? -1;
          comparison = aRating - bRating;
          break;
        }
        case "interviewRating": {
          const aRating = a.interviewAggregateRating ?? -1;
          const bRating = b.interviewAggregateRating ?? -1;
          comparison = aRating - bRating;
          break;
        }
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [allApplications, searchTerm, sortBy, sortDirection]);

  // Initial load
  useEffect(() => {
    async function init() {
      if (initialLoadDone.current) return;
      initialLoadDone.current = true;

      setLoading(true);
      try {
        // Try to load from cache first
        let fetchedApps: ApplicationWithUser[] = [];
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const cachedData: CachedData = JSON.parse(cached);
            if (Date.now() - cachedData.timestamp < CACHE_TTL) {
              fetchedApps = cachedData.applications;
              setAllApplications(fetchedApps);
              setLoading(false); // We have data, can stop main loading spinner
            }
          } catch (e) {
            console.error("Failed to parse cached applications", e);
          }
        }

        // If no cache or expired, fetch from API
        if (fetchedApps.length === 0) {
          fetchedApps = await fetchAllApps();
        } else {
          // If we have cache, we might still want to background refresh or just rely on manual refresh
          // For now, let's just use the cache to keep it snappy.
        }

        // If we have a selectedApplicationId and it's not in the list, fetch it separately
        if (selectedApplicationId && !fetchedApps.some((a: ApplicationWithUser) => a.id === selectedApplicationId)) {
          const selectedApp = await fetchSingleApp(selectedApplicationId);
          if (selectedApp) {
            setAllApplications(prev => {
              if (prev.some(a => a.id === selectedApplicationId)) return prev;
              return [selectedApp, ...prev];
            });
          }
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle selectedApplicationId changes AFTER initial load
  useEffect(() => {
    if (!initialLoadDone.current || loading || !selectedApplicationId) return;
    if (allApplications.some(a => a.id === selectedApplicationId)) return;

    fetchSingleApp(selectedApplicationId).then(selectedApp => {
      if (selectedApp) {
        setAllApplications(prev => {
          if (prev.some(a => a.id === selectedApplicationId)) return prev;
          return [selectedApp, ...prev];
        });
      }
    });
  }, [selectedApplicationId, loading, fetchSingleApp, allApplications]);

  return (
    <ApplicationsContext.Provider value={{
      applications: processedApplications,
      allApplications,
      setApplications: setAllApplications as any,
      loading,
      refetching,
      loadingMore: false,
      hasMore: false,
      currentUser,
      recruitingStep,
      refreshApplications,
      loadMore: async () => { },
      ensureApplicationLoaded,
      bulkUpdateStatus,
      sortBy,
      sortDirection,
      setSortBy,
      setSortDirection,
      searchTerm,
      setSearchTerm,
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


