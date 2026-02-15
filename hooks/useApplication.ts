import useSWR from "swr";
import { Application } from "@/lib/models/Application";
import { FetchError } from "@/lib/auth/fetcher";

interface ApplicationResponse {
  application: Application;
}

// Custom fetcher that handles 401 by logging out
const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (res.status === 401) {
    // Session mismatch - log out the user
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    }
    window.location.href = "/auth/login";
    throw new FetchError("Unauthorized", 401);
  }

  if (res.status === 404) {
    throw new FetchError("Application not found", 404);
  }
  if (res.status === 403) {
    throw new FetchError("You don't have permission to view this application", 403);
  }
  if (!res.ok) throw new Error("Failed to fetch application");
  return res.json();
};

/**
 * Hook to fetch a single application by ID.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useApplication(applicationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApplicationResponse>(
    applicationId ? `/api/applications/${applicationId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 60s dedup to avoid redundant fetches
    }
  );

  return {
    application: data?.application ?? null,
    isLoading,
    error: error as (Error & { status?: number }) | undefined,
    mutate,
  };
}
