/**
 * Auth-aware fetcher for SWR hooks.
 * Automatically handles 401 errors by logging out the user and redirecting to login.
 */

/**
 * Logs out the user by calling the logout API and redirecting to login.
 */
async function handleUnauthorized() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout errors - we're redirecting anyway
  }
  // Redirect to login page
  window.location.href = "/auth/login";
}

/**
 * Custom error class that includes HTTP status code
 */
export class FetchError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "FetchError";
  }
}

/**
 * Auth-aware fetcher that handles 401 errors by logging out.
 * Use this fetcher in SWR hooks to ensure session mismatches trigger logout.
 */
export async function authFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  
  if (res.status === 401) {
    // Session mismatch or expired - log out the user
    await handleUnauthorized();
    throw new FetchError("Unauthorized", 401);
  }
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.message || "Request failed";

    if (res.status === 404 && errorMessage === "User not found") {
      await handleUnauthorized();
      throw new FetchError("User not found", 404);
    }

    throw new FetchError(errorMessage, res.status);
  }
  
  return res.json();
}

/**
 * Auth-aware fetcher that returns null for 401 instead of logging out.
 * Use this for endpoints where unauthenticated access is expected (e.g., /api/auth/me).
 */
export async function authFetcherWithNull<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  
  if (res.status === 401) {
    // Not authenticated - return null
    return null;
  }
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMessage = errorData.error || errorData.message || "Request failed";

    if (res.status === 404 && errorMessage === "User not found") {
      await handleUnauthorized();
      throw new FetchError("User not found", 404);
    }

    throw new FetchError(errorMessage, res.status);
  }
  
  return res.json();
}
