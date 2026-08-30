import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, guardErrorStatus } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { updateAggregateRating } from "@/lib/firebase/updateAggregateRating";
import { Team } from "@/lib/models/User";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


/**
 * POST /api/admin/applications/backfill-ratings
 * Backfill aggregate ratings for all applications that have scorecards.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await requireAdmin();

    // Get all applications
    const applicationsSnapshot = await adminDb.collection("applications").get();
    
    let processed = 0;
    let updated = 0;
    let errors = 0;

    for (const appDoc of applicationsSnapshot.docs) {
      processed++;
      const app = appDoc.data();
      const appId = appDoc.id;
      const team = app.team as Team;
      
      if (!team) continue;

      // Get all systems that have scorecards for this application
      const scorecardsSnapshot = await adminDb
        .collection("applications")
        .doc(appId)
        .collection("scorecards")
        .get();
      
      const interviewScorecardsSnapshot = await adminDb
        .collection("applications")
        .doc(appId)
        .collection("interviewScorecards")
        .get();

      // Get unique systems from both scorecard types
      const systems = new Set<string>();
      scorecardsSnapshot.docs.forEach(doc => {
        const system = doc.data().system;
        if (system) systems.add(system);
      });
      interviewScorecardsSnapshot.docs.forEach(doc => {
        const system = doc.data().system;
        if (system) systems.add(system);
      });

      // Update ratings for each system
      for (const system of systems) {
        try {
          // Check if there are application scorecards for this system
          const hasAppScorecards = scorecardsSnapshot.docs.some(doc => doc.data().system === system);
          if (hasAppScorecards) {
            await updateAggregateRating(appId, system, "review", team);
            updated++;
          }

          // Check if there are interview scorecards for this system
          const hasInterviewScorecards = interviewScorecardsSnapshot.docs.some(doc => doc.data().system === system);
          if (hasInterviewScorecards) {
            await updateAggregateRating(appId, system, "interview", team);
            updated++;
          }
        } catch (err) {
          logger.error({ appId, system, err }, "Failed to update rating for application/system");
          errors++;
        }
      }
    }

    await recordAudit(request, actor, { action: "application.backfill_ratings", detail: "backfilled aggregate ratings" });
    return NextResponse.json({ 
      success: true, 
      processed,
      updated,
      errors,
      message: `Processed ${processed} applications, updated ${updated} ratings, ${errors} errors`
    }, { status: 200 });

  } catch (error) {
    const guardStatus = guardErrorStatus(error);
    if (guardStatus) return NextResponse.json({ error: (error as Error).message }, { status: guardStatus });
    logger.error(error, "Failed to backfill ratings");
    
    if (error instanceof Error && error.message.includes("Admin")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
