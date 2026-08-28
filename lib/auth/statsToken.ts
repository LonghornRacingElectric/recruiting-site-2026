import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for the read-only stats endpoints.
 *
 * This is deliberately not a user session: the recruiting bot holds this
 * token and nothing else, so the most it can ever do is read aggregate
 * numbers. Rotate STATS_API_TOKEN in Vercel to cut it off.
 */
export function checkStatsToken(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.STATS_API_TOKEN;
  if (!expected) return { ok: false, status: 503, error: "STATS_API_TOKEN is not configured" };

  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { ok: false, status: 401, error: "Unauthorized" };

  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(match[1]).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}
