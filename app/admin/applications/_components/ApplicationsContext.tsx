"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";

interface ApplicationWithUser extends Application {
  user: User;
  aggregateRating?: number | null;
  interviewAggregateRating?: number | null;
}

type SortBy = "date" | "name" | "rating" | "interviewRating";
type SortDirection = "asc" | "desc";

interface ApplicationsContextType {
  applications: ApplicationWithUser[];
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

export function ApplicationsProvider({ children, selectedApplicationId }: ApplicationsProviderProps) {
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [recruitingStep, setRecruitingStep] = useState<RecruitingStep | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortByState] = useState<SortBy>("date");
  const [sortDirection, setSortDirectionState] = useState<SortDirection>("desc");
  const [searchTerm, setSearchTermState] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const initialLoadDone = useRef(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchApps = useCallback(async (cursor?: string, append = false, page?: number) => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("sortBy", sortBy);
      params.set("sortDirection", sortDirection);
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      
      if (cursor) {
        params.set("cursor", cursor);
      }
      if (page !== undefined) {
        params.set("page", String(page));
      }

      const res = await fetch(`/api/admin/applications?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newApps = data.applications || [];
        
        if (append) {
          // Deduplicate by id when appending
          setApplications(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const uniqueNewApps = newApps.filter((a: ApplicationWithUser) => !existingIds.has(a.id));
            return [...prev, ...uniqueNewApps];
          });
        } else {
          setApplications(newApps);
        }
        
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore || false);
        
        return newApps;
      }
      return [];
    } catch (err) {
      console.error("Failed to fetch applications", err);
      return [];
    }
  }, [sortBy, sortDirection, debouncedSearch]);

  // Fetch a specific application by ID
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
    const alreadyInList = applications.some(a => a.id === appId);
    if (alreadyInList) return;

    const selectedApp = await fetchSingleApp(appId);
    if (selectedApp) {
      setApplications(prev => {
        // Check again to avoid duplicates
        if (prev.some(a => a.id === appId)) {
          return prev;
        }
        return [selectedApp, ...prev];
      });
    }
  }, [applications, fetchSingleApp]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    
    setLoadingMore(true);
    try {
      // If nextCursor is a number (page-based for non-date sorts), pass it as page
      const pageNum = parseInt(nextCursor, 10);
      if (!isNaN(pageNum) && (sortBy !== "date" || debouncedSearch)) {
        await fetchApps(undefined, true, pageNum);
      } else {
        await fetchApps(nextCursor, true);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchApps, sortBy]);

  const refreshApplications = useCallback(async () => {
    setNextCursor(null);
    setHasMore(false);
    await fetchApps();
  }, [fetchApps]);

  // Sort setters that trigger a refresh
  const setSortBy = useCallback((newSortBy: SortBy) => {
    if (newSortBy === sortBy) return;
    setSortByState(newSortBy);
  }, [sortBy]);

  const setSortDirection = useCallback((newDirection: SortDirection) => {
    if (newDirection === sortDirection) return;
    setSortDirectionState(newDirection);
  }, [sortDirection]);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
  }, []);

  // Re-fetch when sort/search changes (after initial load)
  useEffect(() => {
    if (!initialLoadDone.current) return;

    setRefetching(true);
    setNextCursor(null);
    setHasMore(false);
    fetchApps().finally(() => setRefetching(false));
  }, [sortBy, sortDirection, debouncedSearch, fetchApps]);

  // Initial load of applications and context data (runs once)
  useEffect(() => {
    async function init() {
      if (initialLoadDone.current) return;
      initialLoadDone.current = true;
      
      setLoading(true);
      try {
        const fetchedApps = await fetchApps();
        
        // If we have a selectedApplicationId and it's not in the list, fetch it separately
        if (selectedApplicationId && !fetchedApps.some((a: ApplicationWithUser) => a.id === selectedApplicationId)) {
          const selectedApp = await fetchSingleApp(selectedApplicationId);
          if (selectedApp) {
            setApplications(prev => {
              if (prev.some(a => a.id === selectedApplicationId)) {
                return prev;
              }
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
  }, []); // Only run once on mount

  // Handle selectedApplicationId changes AFTER initial load
  useEffect(() => {
    if (!initialLoadDone.current || loading) return;
    if (!selectedApplicationId) return;
    
    // Check if the selected app is already in the list
    const alreadyInList = applications.some(a => a.id === selectedApplicationId);
    if (alreadyInList) return;

    // Fetch and add the selected application
    fetchSingleApp(selectedApplicationId).then(selectedApp => {
      if (selectedApp) {
        setApplications(prev => {
          if (prev.some(a => a.id === selectedApplicationId)) {
            return prev;
          }
          return [selectedApp, ...prev];
        });
      }
    });
  }, [selectedApplicationId, loading, applications, fetchSingleApp]);

  return (
    <ApplicationsContext.Provider value={{
      applications,
      setApplications,
      loading,
      refetching,
      loadingMore,
      hasMore,
      currentUser, 
      recruitingStep,
      refreshApplications,
      loadMore,
      ensureApplicationLoaded,
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


