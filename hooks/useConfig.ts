import useSWR from "swr";
import { RecruitingStep } from "@/lib/models/Config";

interface ConfigResponse {
  config: {
    currentStep: RecruitingStep;
  };
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
});

/**
 * Hook to fetch the recruiting configuration.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useConfig() {
  const { data, error, isLoading } = useSWR<ConfigResponse>(
    "/api/config",
    fetcher
  );

  return {
    config: data?.config ?? null,
    recruitingStep: data?.config?.currentStep ?? null,
    isLoading,
    error,
  };
}
