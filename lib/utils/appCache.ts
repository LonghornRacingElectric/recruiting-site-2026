import { RecruitingStep, ApplicationQuestionsConfig } from "@/lib/models/Config";

/**
 * Shared in-memory cache for application data and configuration.
 * Using a singleton pattern to ensure the same cache is accessed across different API routes
 * within the same server instance.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MIN_INVALIDATION_INTERVAL = 30 * 1000; // 30 seconds

class AppCache {
  private applications = new Map<string, CacheEntry<any>>();
  private recruitingStep: CacheEntry<RecruitingStep | null> | null = null;
  private questions: CacheEntry<ApplicationQuestionsConfig> | null = null;
  private lastInvalidated = 0;

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
   * Clear all application caches
   * @returns true if invalidated, false if skipped due to cooldown
   */
  invalidateApplications(): boolean {
    const now = Date.now();
    if (now - this.lastInvalidated < MIN_INVALIDATION_INTERVAL) {
      console.log(`[Cache INVALIDATE] Skipped - within ${MIN_INVALIDATION_INTERVAL / 1000}s cooldown`);
      return false;
    }

    console.log(`[Cache INVALIDATE] Clearing all application list caches`);
    this.applications.clear();
    this.lastInvalidated = now;
    return true;
  }

  /**
   * Get the time remaining until next invalidation is allowed
   */
  getCooldownRemaining(): number {
    const remaining = MIN_INVALIDATION_INTERVAL - (Date.now() - this.lastInvalidated);
    return Math.max(0, remaining);
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

  /**
   * Get cached questions
   */
  getQuestions(): ApplicationQuestionsConfig | null {
    if (this.questions && Date.now() - this.questions.timestamp < CACHE_TTL) {
      console.log(`[Cache HIT] Application Questions`);
      return this.questions.data;
    }
    console.log(`[Cache MISS] Application Questions`);
    return null;
  }

  /**
   * Set cached questions
   */
  setQuestions(data: ApplicationQuestionsConfig): void {
    console.log(`[Cache SET] Application Questions`);
    this.questions = { data, timestamp: Date.now() };
  }

  /**
   * Invalidate questions cache
   */
  invalidateQuestions(): void {
    this.questions = null;
  }
}

// Global singleton
export const appCache = new AppCache();
