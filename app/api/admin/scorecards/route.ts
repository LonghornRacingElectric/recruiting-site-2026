import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { 
  getScorecardConfigsForUser, 
  createScorecardConfig,
  canUserModifyConfig 
} from "@/lib/firebase/scorecards";
import { Team } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/scorecards
 * List all scorecard configs the user is authorized to see.
 */
export async function GET(request: NextRequest) {
  try {
    const { uid } = await requireStaff();
    const configs = await getScorecardConfigsForUser(uid);
    return NextResponse.json({ configs }, { status: 200 });
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
 */
export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireStaff();
    
    const body = await request.json();
    const { team, system, fields } = body;

    if (!team || !system) {
      return NextResponse.json({ error: "Team and system are required" }, { status: 400 });
    }

    if (!Object.values(Team).includes(team)) {
      return NextResponse.json({ error: "Invalid team" }, { status: 400 });
    }

    // Check if user can create config for this team/system
    const canModify = await canUserModifyConfig(uid, team, system);
    if (!canModify) {
      return NextResponse.json({ error: "Forbidden: You cannot create configs for this system" }, { status: 403 });
    }

    const config = await createScorecardConfig({
      team,
      system,
      fields: fields || [],
    }, uid);

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
