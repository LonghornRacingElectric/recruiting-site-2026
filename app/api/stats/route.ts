import { NextResponse } from "next/server";
import { checkStatsToken } from "@/lib/auth/statsToken";
import { getRecruitingStats, toPublicStats } from "@/lib/firebase/stats";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats
 *
 * Read-only aggregate recruiting numbers for the recruiting bot. Token-gated
 * (Authorization: Bearer STATS_API_TOKEN), never a user session, and the
 * response shape contains only counts — see toPublicStats().
 */
export async function GET(request: Request) {
  const auth = checkStatsToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const stats = await getRecruitingStats();
    return NextResponse.json(toPublicStats(stats), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to compute public stats");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
