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
      console.log(`[Cache HIT] Applications list for key: ${key}`);
      return cached.data;
    }
    console.log(`[Cache MISS] Applications list for key: ${key}`);
    return null;
  }

  /**
   * Set cached application list
   */
  setApplications(key: string, data: any): void {
    console.log(`[Cache SET] Applications list for key: ${key}`);
    this.applications.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear all application caches (call this after mutations)
   */
  invalidateApplications(): void {
    console.log(`[Cache INVALIDATE] Clearing all application list caches`);
    this.applications.clear();
  }

  /**
   * Get cached recruiting step
   */
  getRecruitingStep(): RecruitingStep | null | undefined {
    if (this.recruitingStep && Date.now() - this.recruitingStep.timestamp < CACHE_TTL) {
      console.log(`[Cache HIT] Recruiting Step: ${this.recruitingStep.data}`);
      return this.recruitingStep.data;
    }
    console.log(`[Cache MISS] Recruiting Step`);
    return undefined; // undefined means not in cache or expired
  }

  /**
   * Set cached recruiting step
   */
  setRecruitingStep(step: RecruitingStep | null): void {
    console.log(`[Cache SET] Recruiting Step: ${step}`);
    this.recruitingStep = { data: step, timestamp: Date.now() };
  }
}

// Global singleton
export const appCache = new AppCache();
