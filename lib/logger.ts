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
    (base.error as any)(...args);

    try {
      const [first, message] = args;
      const { err, context } = extractError(first);
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
