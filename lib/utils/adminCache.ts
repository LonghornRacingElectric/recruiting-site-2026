/**
 * The admin applications list is cached in localStorage so the sidebar can
 * paint before the network answers. The key carries the staff member's uid
 * (#71): one person's list must never seed another person's session on a
 * shared machine, and logging out (or being logged out by a 401) clears it.
 */
export const ADMIN_APPS_CACHE_PREFIX = "admin_applications_cache";

export function adminAppsCacheKey(uid: string): string {
  return `${ADMIN_APPS_CACHE_PREFIX}:${uid}`;
}

/** Remove every cached admin list, whichever account wrote it. Safe to call anywhere. */
export function clearAdminAppsCache(): void {
  try {
    if (typeof window === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ADMIN_APPS_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage unavailable — nothing to clear
  }
}
