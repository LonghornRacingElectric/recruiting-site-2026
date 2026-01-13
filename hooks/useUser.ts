import useSWR from "swr";

interface UserData {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
}

interface UserResponse {
  user: UserData;
}

const fetcher = (url: string) => fetch(url).then(async (res) => {
  if (res.status === 401) {
    // Not authenticated - return null user
    return { user: null };
  }
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
});

/**
 * Hook to fetch the current authenticated user.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useUser() {
  const { data, error, isLoading, mutate } = useSWR<UserResponse | { user: null }>(
    "/api/auth/me",
    fetcher,
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
