/**
 * Server instrumentation (Next.js convention file).
 *
 * onRequestError fires for errors that escape route handlers, server
 * components, and server actions — the *uncaught* layer. Most of this app's
 * API routes catch their own errors and report them through lib/logger.ts,
 * which tees logger.error(...) to PostHog; this hook covers everything that
 * slips past those catches (render crashes, module-level failures, etc.).
 */
export function register() {
  // No startup work needed; exists so Next loads this file.
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { captureServerException } = await import("@/lib/posthog/server");
  captureServerException(error, {
    uncaught: true,
    path: request.path,
    method: request.method,
    router_kind: context.routerKind,
    route_path: context.routePath,
    route_type: context.routeType,
  });
}
