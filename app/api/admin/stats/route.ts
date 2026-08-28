import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { getRecruitingStats, invalidateRecruitingStats } from "@/lib/firebase/stats";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/stats — full aggregate stats for /admin/stats (staff only).
 * POST /api/admin/stats — drop the 5-minute cache and recompute.
 *
 * Aggregate only: nothing in the payload identifies an applicant.
 */
export async function GET() {
  try {
    await requireStaff();
    const stats = await getRecruitingStats();
    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error, "Failed to load admin stats");
  }
}

export async function POST() {
  try {
    await requireStaff();
    invalidateRecruitingStats();
    const stats = await getRecruitingStats({ fresh: true });
    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error, "Failed to refresh admin stats");
  }
}

function handleError(error: unknown, message: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof Error && error.message.includes("Forbidden")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  logger.error({ err: error }, message);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
