import pino from "pino";
import { captureServerException } from "@/lib/posthog/server";

/**
 * Shared server logger. Drop-in replacement for the per-file `pino()`
 * instances this repo used to create — same call signatures — with one
 * addition: every `logger.error(...)` is also reported to PostHog error
 * monitoring.
 *
 * That tee matters because almost every API route catches its own errors and
 * returns a JSON error response, so a global uncaught-error hook alone would
 * see almost nothing. The pino conventions used across the repo are:
 *
 *   logger.error({ err }, "message")
 *   logger.error({ error, ...context }, "message")
 *   logger.error(error, "message")
 *
 * We pull the Error out of whichever shape was used; remaining first-arg
 * fields ride along as event properties.
 */
const base = pino();

/**
 * Expected auth denials reach logger.error because every route's catch block
 * logs before mapping the error to a 401/403: guards throwing Unauthorized /
 * Forbidden, and Firebase session cookies expiring or being revoked (the
 * guards re-throw those as plain Errors, so only the message survives). They
 * are not incidents, and PostHog files a GitHub issue per exception, so they
 * are logged at warn and kept out of error monitoring.
 */
function isExpectedAuthDenial(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  if (code === "auth/session-cookie-expired" || code === "auth/session-cookie-revoked") return true;
  return (
    err.message === "Unauthorized" ||
    err.message.startsWith("Forbidden") ||
    /Firebase (ID token|session cookie) has (expired|been revoked)/.test(err.message)
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractError(first: any): { err: unknown; context: Record<string, unknown> } {
  if (first instanceof Error) return { err: first, context: {} };

  if (first && typeof first === "object") {
    const { err, error, ...rest } = first;
    return { err: err ?? error, context: rest };
  }

  return { err: undefined, context: {} };
}

export const logger = {
  debug: (...args: any[]) => (base.debug as any)(...args),
  info: (...args: any[]) => (base.info as any)(...args),
  warn: (...args: any[]) => (base.warn as any)(...args),
  error: (...args: any[]) => {
    const [first, message] = args;
    const { err, context } = extractError(first);

    if (isExpectedAuthDenial(err)) {
      (base.warn as any)(...args);
      return;
    }

    (base.error as any)(...args);

    try {
      const msg = typeof message === "string" ? message : undefined;

      captureServerException(err ?? new Error(msg ?? "Server error"), {
        log_message: msg,
        ...context,
      });
    } catch {
      // Logging must never throw.
    }
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
