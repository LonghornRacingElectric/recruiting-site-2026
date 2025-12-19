import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { 
  getScorecardConfigById,
  updateScorecardConfig,
  deleteScorecardConfig,
  canUserModifyConfig 
} from "@/lib/firebase/scorecards";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/scorecards/[id]
 * Get a specific scorecard config by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    
    const config = await getScorecardConfigById(id);
    if (!config) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch scorecard config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/scorecards/[id]
 * Update a scorecard configuration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await requireStaff();
    const { id } = await params;
    
    // Get existing config to check permissions
    const existing = await getScorecardConfigById(id);
    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    // Check if user can modify this config
    const canModify = await canUserModifyConfig(uid, existing.team, existing.system!);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden: You cannot modify this config" }, { status: 403 });
    }

    const body = await request.json();
    const { fields } = body;

    await updateScorecardConfig(id, { fields });
    
    // Fetch updated config
    const updated = await getScorecardConfigById(id);

    return NextResponse.json({ config: updated }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to update scorecard config");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/scorecards/[id]
 * Delete a scorecard configuration.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await requireStaff();
    const { id } = await params;
    
    // Get existing config to check permissions
    const existing = await getScorecardConfigById(id);
    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    // Check if user can modify this config
    const canModify = await canUserModifyConfig(uid, existing.team, existing.system!);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden: You cannot delete this config" }, { status: 403 });
    }

    await deleteScorecardConfig(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to delete scorecard config");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
