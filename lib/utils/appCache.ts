import { RecruitingStep } from "@/lib/models/Config";

/**
 * Shared in-memory cache for application data and configuration.
 * Using a singleton pattern to ensure the same cache is accessed across different API routes
 * within the same server instance.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 60 * 1000; // 1 minute

class AppCache {
  private applications = new Map<string, CacheEntry<any>>();
  private recruitingStep: CacheEntry<RecruitingStep | null> | null = null;

  /**
   * Get cached application list for a specific RBAC key
   */
  getApplications(key: string): any | null {
    const cached = this.applications.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cached application list
   */
  setApplications(key: string, data: any): void {
    this.applications.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear all application caches (call this after mutations)
   */
  invalidateApplications(): void {
    this.applications.clear();
  }

  /**
   * Get cached recruiting step
   */
  getRecruitingStep(): RecruitingStep | null | undefined {
    if (this.recruitingStep && Date.now() - this.recruitingStep.timestamp < CACHE_TTL) {
      return this.recruitingStep.data;
    }
    return undefined; // undefined means not in cache or expired
  }

  /**
   * Set cached recruiting step
   */
  setRecruitingStep(step: RecruitingStep | null): void {
    this.recruitingStep = { data: step, timestamp: Date.now() };
  }
}

// Global singleton
export const appCache = new AppCache();
