import useSWR from "swr";
import { Application } from "@/lib/models/Application";

interface ApplicationResponse {
  application: Application;
}

const fetcher = (url: string) => fetch(url).then(async (res) => {
  if (res.status === 404) {
    const error = new Error("Application not found") as Error & { status: number };
    error.status = 404;
    throw error;
  }
  if (res.status === 403) {
    const error = new Error("You don't have permission to view this application") as Error & { status: number };
    error.status = 403;
    throw error;
  }
  if (!res.ok) throw new Error("Failed to fetch application");
  return res.json();
});

/**
 * Hook to fetch a single application by ID.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useApplication(applicationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ApplicationResponse>(
    applicationId ? `/api/applications/${applicationId}` : null,
    fetcher
  );

  return {
    application: data?.application ?? null,
    isLoading,
    error: error as (Error & { status?: number }) | undefined,
    mutate,
  };
}
