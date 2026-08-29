import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { 
  getScorecardConfigById,
  updateScorecardConfig,
  deleteScorecardConfig,
  canUserModifyConfig 
} from "@/lib/firebase/scorecards";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


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

    await recordAudit(request, { uid }, { action: "scorecard_config.update", detail: `updated ${id}` });
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
 * Also removes associated aggregate ratings from applications.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { uid } = await requireStaff();
    const { id } = await params;
    
    // Get existing config to check permissions and get system/type info
    const existing = await getScorecardConfigById(id);
    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    // Check if user can modify this config
    const canModify = await canUserModifyConfig(uid, existing.team, existing.system!);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden: You cannot delete this config" }, { status: 403 });
    }

    // Delete the config
    await deleteScorecardConfig(id);

    // Remove aggregate ratings for this system from all applications of this team
    // We use batched writes for efficiency
    const system = existing.system;
    const team = existing.team;
    const isInterview = existing.scorecardType === "interview";
    const ratingField = isInterview ? "interviewRating" : "reviewRating";

    if (system) {
      // Query all applications for this team that have ratings for this system
      const applicationsSnapshot = await adminDb
        .collection("applications")
        .where("team", "==", team)
        .get();
      
      const batch = adminDb.batch();
      let batchCount = 0;

      for (const doc of applicationsSnapshot.docs) {
        const appData = doc.data();
        const aggregateRatings = appData.aggregateRatings;
        
        if (aggregateRatings && aggregateRatings[system]) {
          // Clear the specific rating field for this system
          const systemRatings = { ...aggregateRatings[system] };
          delete systemRatings[ratingField];
          
          // If both ratings are now gone, remove the whole system entry
          if (!systemRatings.reviewRating && !systemRatings.interviewRating) {
            batch.update(doc.ref, {
              [`aggregateRatings.${system}`]: FieldValue.delete(),
            });
          } else {
            // Just update the rating field
            batch.update(doc.ref, {
              [`aggregateRatings.${system}.${ratingField}`]: FieldValue.delete(),
            });
          }
          batchCount++;
          
          // Firestore batches are limited to 500 operations
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
      }
      
      logger.info({ system, team, type: existing.scorecardType }, "Cleared aggregate ratings for deleted config");
    }

    await recordAudit(request, { uid }, { action: "scorecard_config.update", detail: `deleted ${id}` });
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

