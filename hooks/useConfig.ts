import useSWR from "swr";
import { RecruitingStep } from "@/lib/models/Config";
import { authFetcher } from "@/lib/auth/fetcher";

interface ConfigResponse {
  config: {
    currentStep: RecruitingStep;
  };
}

/**
 * Hook to fetch the recruiting configuration.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useConfig() {
  const { data, error, isLoading } = useSWR<ConfigResponse>(
    "/api/config",
    authFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000, // 5min dedup — config rarely changes mid-session
    }
  );

  return {
    config: data?.config ?? null,
    recruitingStep: data?.config?.currentStep ?? null,
    isLoading,
    error,
  };
}
