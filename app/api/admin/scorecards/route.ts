import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { 
  getScorecardConfigsForUser, 
  createScorecardConfig,
  canUserModifyConfig 
} from "@/lib/firebase/scorecards";
import { Team } from "@/lib/models/User";
import { ScorecardType } from "@/lib/models/Scorecard";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


// Cache scorecard configs for 5 minutes
const CACHE_MAX_AGE = 300;
const STALE_WHILE_REVALIDATE = 60;

/**
 * GET /api/admin/scorecards
 * List all scorecard configs the user is authorized to see.
 * Query params:
 *   - type: Optional, filter by scorecard type ("application" or "interview")
 */
export async function GET(request: NextRequest) {
  try {
    const { uid } = await requireStaff();
    
    // Parse type from query params
    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type") as ScorecardType | null;
    
    const configs = await getScorecardConfigsForUser(uid, typeParam || undefined);
    return NextResponse.json(
      { configs }, 
      { 
        status: 200,
        headers: {
          'Cache-Control': `private, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  } catch (error) {
    logger.error(error, "Failed to fetch scorecard configs");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/scorecards
 * Create a new scorecard configuration.
 * Body:
 *   - team: Team name (required)
 *   - system: System name (required)
 *   - fields: Array of field configs (optional)
 *   - scorecardType: "application" or "interview" (optional, defaults to "application")
 */
export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireStaff();
    
    const body = await request.json();
    const { team, system, fields, scorecardType } = body;

    if (!team || !system) {
      return NextResponse.json({ error: "Team and system are required" }, { status: 400 });
    }

    if (!Object.values(Team).includes(team)) {
      return NextResponse.json({ error: "Invalid team" }, { status: 400 });
    }
    
    // Validate scorecardType if provided
    const validTypes: ScorecardType[] = ["application", "interview"];
    if (scorecardType && !validTypes.includes(scorecardType)) {
      return NextResponse.json({ error: "Invalid scorecard type" }, { status: 400 });
    }

    // Check if user can create config for this team/system
    const canModify = await canUserModifyConfig(uid, team, system);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden: You cannot create configs for this system" }, { status: 403 });
    }

    const config = await createScorecardConfig({
      team,
      system,
      scorecardType: scorecardType || "application",
      fields: fields || [],
    }, uid);

    await recordAudit(request, { uid }, { action: "scorecard_config.update", detail: `created ${config.id ?? "scorecard config"}` });
    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    logger.error(error, "Failed to create scorecard config");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
