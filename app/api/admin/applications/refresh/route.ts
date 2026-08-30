import { NextRequest, NextResponse } from "next/server";
import { requireStaff, guardErrorStatus } from "@/lib/auth/guard";
import { appCache } from "@/lib/utils/appCache";

/**
 * POST /api/admin/applications/refresh
 * Force invalidates the applications cache.
 * Rate limited to once every 30 seconds.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireStaff();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const success = appCache.requestRefresh();

    if (!success) {
      const remaining = Math.ceil(appCache.getCooldownRemaining() / 1000);
      return NextResponse.json({
        error: `Please wait ${remaining}s before refreshing again.`,
        cooldownRemaining: remaining
      }, { status: 429 });
    }

    return NextResponse.json({
      success: true,
      message: "Applications cache invalidated successfully."
    });
  } catch (error) {
    const guardStatus = guardErrorStatus(error);
    if (guardStatus) return NextResponse.json({ error: (error as Error).message }, { status: guardStatus });
    console.error("Failed to refresh applications cache", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/admin/applications/refresh
 * Get the current cooldown status.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireStaff();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The real cooldown (#70): the button used to promise a refresh the POST
    // would then refuse with a 429.
    const remaining = Math.ceil(appCache.getCooldownRemaining() / 1000);
    return NextResponse.json({
      cooldownRemaining: remaining,
      canRefresh: remaining === 0
    });
  } catch (error) {
    const guardStatus = guardErrorStatus(error);
    if (guardStatus) return NextResponse.json({ error: (error as Error).message }, { status: guardStatus });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
