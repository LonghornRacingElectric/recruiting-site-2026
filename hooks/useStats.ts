import { useCallback, useState } from "react";
import useSWR from "swr";
import { authFetcher } from "@/lib/auth/fetcher";
import type { RecruitingStats } from "@/lib/firebase/stats";

/**
 * Aggregate recruiting stats for /admin/stats. Server-cached for 5 minutes;
 * refresh() forces a recompute.
 */
export function useStats() {
  const { data, error, isLoading, mutate } = useSWR<RecruitingStats>("/api/admin/stats", authFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stats", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Refresh failed");
      const fresh = (await res.json()) as RecruitingStats;
      await mutate(fresh, { revalidate: false });
    } finally {
      setRefreshing(false);
    }
  }, [mutate]);

  return { stats: data ?? null, error, isLoading, refreshing, refresh };
}
