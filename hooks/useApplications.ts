import useSWR from "swr";
import { Application } from "@/lib/models/Application";
import { RecruitingStep, Announcement } from "@/lib/models/Config";

interface ApplicationsResponse {
  applications: Application[];
  step: RecruitingStep;
  announcement: Announcement | null;
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch applications");
  return res.json();
});

/**
 * Hook to fetch the current user's applications and recruiting step.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useApplications() {
  const { data, error, isLoading, mutate } = useSWR<ApplicationsResponse>(
    "/api/applications",
    fetcher
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

