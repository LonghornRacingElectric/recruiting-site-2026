import useSWR from "swr";
import { authFetcher } from "@/lib/auth/fetcher";
import { Application } from "@/lib/models/Application";
import { RecruitingStep, Announcement } from "@/lib/models/Config";

interface ApplicationsResponse {
  applications: Application[];
  step: RecruitingStep;
  announcement: Announcement | null;
}

/**
 * Hook to fetch the current user's applications and recruiting step.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useApplications() {
  const { data, error, isLoading, mutate } = useSWR<ApplicationsResponse>(
    "/api/applications",
    authFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000,
    }
  );

  return {
    applications: data?.applications ?? [],
    recruitingStep: data?.step ?? RecruitingStep.OPEN,
    announcement: data?.announcement ?? null,
    isLoading,
    error,
    mutate,
  };
}


