import useSWR from "swr";
import { authFetcherWithNull } from "@/lib/auth/fetcher";

interface UserData {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
}

interface UserResponse {
  user: UserData;
}

/**
 * Hook to fetch the current authenticated user.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useUser() {
  const { data, error, isLoading, mutate } = useSWR<UserResponse | { user: null } | null>(
    "/api/auth/me",
    authFetcherWithNull as (url: string) => Promise<UserResponse | { user: null } | null>,
    {
      // Don't retry on 401 errors
      shouldRetryOnError: false,
      // Revalidate when window regains focus
      revalidateOnFocus: true,
    }
  );

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    error,
    mutate,
  };
}
