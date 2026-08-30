import { RecruitingStep, ApplicationQuestionsConfig } from "@/lib/models/Config";

/**
 * Shared in-memory cache for configuration, per server instance (a singleton
 * across API routes within one instance — on serverless, one instance only,
 * so an invalidation here never reaches the others; the TTLs bound that).
 *
 * What is cached: the recruiting step and the application questions. The
 * application *list* is not cached here — that cache was dead code (#70).
 * `invalidateApplications()` is what mutating routes call after a write; it
 * drops the cached recruiting step (the one thing that made stale reads
 * visible). The admin "refresh" button goes through `requestRefresh()`, which
 * is the only thing the 30s cooldown rate-limits.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes — recruiting step
const QUESTIONS_TTL = 5 * 60 * 1000; // 5 minutes — a question fix must reach open forms quickly (#60)
const MIN_INVALIDATION_INTERVAL = 30 * 1000; // 30 seconds

class AppCache {
  private recruitingStep: CacheEntry<RecruitingStep | null> | null = null;
  private questions: CacheEntry<ApplicationQuestionsConfig> | null = null;
  private lastInvalidated = 0;

  /**
   * Called after any application or step mutation. Never rate-limited.
   * Nothing server-side caches the list any more; this drops the instance's
   * cached recruiting step so its next read is fresh — the only cross-instance
   * refresh we have besides the TTL (the step route re-primes its own).
   */
  invalidateApplications(): void {
    this.recruitingStep = null;
  }

  /**
   * The admin refresh button: clears everything this instance holds,
   * at most once per cooldown.
   * @returns false when still inside the cooldown (nothing cleared)
   */
  requestRefresh(): boolean {
    const now = Date.now();
    if (now - this.lastInvalidated < MIN_INVALIDATION_INTERVAL) {
      return false;
    }
    this.lastInvalidated = now;
    this.recruitingStep = null;
    this.questions = null;
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
    if (this.questions && Date.now() - this.questions.timestamp < QUESTIONS_TTL) {
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
