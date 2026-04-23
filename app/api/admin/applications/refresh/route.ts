import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
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

    const success = appCache.invalidateApplications();

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

    // const remaining = Math.ceil(appCache.getCooldownRemaining() / 1000);
    const remaining: number = 0;
    return NextResponse.json({
      cooldownRemaining: remaining,
      canRefresh: remaining === 0
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
