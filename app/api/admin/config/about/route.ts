"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getAboutPageConfig, updateAboutPageConfig } from "@/lib/firebase/config";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


/**
 * GET /api/admin/config/about
 * Fetch about page config (admin access)
 */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getAboutPageConfig();
    
    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch about page config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/config/about
 * Update about page config (Admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();
    
    const body = await request.json();
    const { title, subtitle, missionStatement, sections } = body;

    // Validate required fields
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    await updateAboutPageConfig(
      { title, subtitle, missionStatement, sections: sections || [] },
      uid
    );
    
    await recordAudit(request, { uid }, { action: "config.update", detail: "about" });
    
    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error(error, "Failed to update about page config");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
