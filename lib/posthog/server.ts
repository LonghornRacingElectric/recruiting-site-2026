import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client for error monitoring.
 *
 * Uses the same public token/host as the browser client so there is exactly one
 * PostHog configuration to manage. When the env vars are absent or malformed
 * (e.g. a fresh environment, or values pasted with quotes), everything here
 * silently no-ops — same contract as the client init in
 * instrumentation-client.ts.
 *
 * flushAt 1 / flushInterval 0 sends each event immediately, which is what we
 * want on serverless: there is no long-lived process to batch on, and Fluid
 * Compute keeps the instance alive long enough for the send to complete.
 */
let client: PostHog | null | undefined;

/** Env values sometimes arrive with quotes/whitespace from dashboard pastes. */
function cleanEnv(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^["']|["']$/g, "");
  return v || undefined;
}

function getClient(): PostHog | null {
  if (client !== undefined) return client;

  const token = cleanEnv(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
  const host = cleanEnv(process.env.NEXT_PUBLIC_POSTHOG_HOST);

  client = null;

  if (token && host) {
    try {
      new URL(host); // reject malformed hosts before the SDK sees them
      const ph = new PostHog(token, { host, flushAt: 1, flushInterval: 0 });

      // A send failure emits 'error'; with no listener attached, Node treats
      // that as fatal and kills the invocation mid-response. Error reporting
      // must never take the request down with it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ph as any).on?.("error", () => {});

      client = ph;
    } catch {
      client = null;
    }
  }

  return client;
}

/**
 * Report a server-side exception to PostHog error tracking.
 *
 * Fire-and-forget by design: error reporting must never throw or slow down the
 * request that triggered it. Extra context lands as event properties.
 */
export function captureServerException(
  error: unknown,
  properties?: Record<string, unknown>
): void {
  try {
    const ph = getClient();
    if (!ph) return;

    const err = error instanceof Error ? error : new Error(String(error));
    ph.captureException(err, "server", properties);
  } catch {
    // Never let error reporting become its own error.
  }
}
