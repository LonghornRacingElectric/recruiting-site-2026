import { NextResponse } from "next/server";
import { requireStaff, guardErrorStatus } from "@/lib/auth/guard";
import { getStatsSnapshots } from "@/lib/firebase/stats";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats/snapshots — the per-step stats snapshots frozen by each
 * forward step transition (staff only). Same aggregate-only rule as the live
 * stats: nothing in a snapshot identifies an applicant.
 */
export async function GET() {
  try {
    await requireStaff();
    const snapshots = await getStatsSnapshots();
    return NextResponse.json({ snapshots }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = guardErrorStatus(error);
    if (status) return NextResponse.json({ error: (error as Error).message }, { status });
    logger.error({ err: error }, "Failed to load stats snapshots");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
