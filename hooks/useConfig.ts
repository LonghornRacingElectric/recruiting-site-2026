import useSWR from "swr";
import { RecruitingStep } from "@/lib/models/Config";
import { authFetcher } from "@/lib/auth/fetcher";

interface ApplicationsStepResponse {
  step: RecruitingStep;
}

/**
 * Hook to fetch the current recruiting step for applicant-facing pages.
 *
 * Reads the `step` that /api/applications already returns (there is no
 * standalone config route for applicants), sharing SWR's cache with
 * useApplications. `recruitingStep` is null only while loading or on error —
 * callers gate on it and must fail closed.
 */
export function useConfig() {
  const { data, error, isLoading } = useSWR<ApplicationsStepResponse>(
    "/api/applications",
    authFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000, // 5min dedup — the step rarely changes mid-session
    }
  );

  return {
    config: data ? { currentStep: data.step } : null,
    recruitingStep: data?.step ?? null,
    isLoading,
    error,
  };
}
