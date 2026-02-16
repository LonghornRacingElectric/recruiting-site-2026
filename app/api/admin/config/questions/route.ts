"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import {
  getApplicationQuestions,
  updateApplicationQuestions,
  updateTeamQuestions,
  updateCommonQuestions,
  updateSystemQuestions
} from "@/lib/firebase/config";
import { UserRole, Team } from "@/lib/models/User";
import { ApplicationQuestion } from "@/lib/models/Config";
import pino from "pino";

const logger = pino();

// Cache the questions for 2 hours (7200 seconds), with stale-while-revalidate for 1 hour
const CACHE_MAX_AGE = 7200;
const STALE_WHILE_REVALIDATE = 3600;

/**
 * GET /api/admin/config/questions
 * Fetch all application questions (staff access, cached)
 */
export async function GET() {
  try {
    await requireStaff();
    const config = await getApplicationQuestions();

    return NextResponse.json(
      { config },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    logger.error(error, "Failed to fetch application questions");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/config/questions
 * Update application questions with role-based access control
 * 
 * Body parameters:
 * - scope: "all" | "common" | "team" | "system"
 * - team?: Team (required if scope is "team")
 * - system?: string (required if scope is "system")
 * - questions: ApplicationQuestion[]
 * - config?: ApplicationQuestionsConfig (required if scope is "all")
 */
export async function PUT(request: NextRequest) {
  try {
    const { uid, user } = await requireStaff();

    const body = await request.json();
    const { scope, team, system, questions, config } = body;

    // Validate scope
    if (!["all", "common", "team", "system"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    // Role-based access control
    const userRole = user?.role as UserRole;
    const userTeam = user?.memberProfile?.team as Team | undefined;
    const userSystem = user?.memberProfile?.system as string | undefined;

    // Admin can do everything
    if (userRole === UserRole.ADMIN) {
      await handleUpdate(scope, uid, { team, system, questions, config });
      return NextResponse.json({ success: true });
    }

    // Team Captain can only update their own team's questions
    if (userRole === UserRole.TEAM_CAPTAIN_OB) {
      if (scope === "team" && team === userTeam) {
        await updateTeamQuestions(team, questions, uid);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Forbidden: Can only edit your own team's questions" }, { status: 403 });
    }

    // System Lead can only update their own system's questions
    if (userRole === UserRole.SYSTEM_LEAD) {
      if (scope === "system" && system === userSystem) {
        await updateSystemQuestions(system, questions, uid);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "Forbidden: Can only edit your own system's questions" }, { status: 403 });
    }

    // Reviewers cannot edit questions
    return NextResponse.json({ error: "Forbidden: Insufficient permissions" }, { status: 403 });

  } catch (error) {
    logger.error(error, "Failed to update application questions");

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

async function handleUpdate(
  scope: string,
  adminId: string,
  data: {
    team?: Team;
    system?: string;
    questions?: ApplicationQuestion[];
    config?: { commonQuestions: ApplicationQuestion[]; teamQuestions: Record<string, ApplicationQuestion[]>; systemQuestions?: Record<string, ApplicationQuestion[]> };
  }
) {
  switch (scope) {
    case "all":
      if (!data.config) throw new Error("Config required for 'all' scope");
      await updateApplicationQuestions(data.config, adminId);
      break;
    case "common":
      if (!data.questions) throw new Error("Questions required for 'common' scope");
      await updateCommonQuestions(data.questions, adminId);
      break;
    case "team":
      if (!data.team || !data.questions) throw new Error("Team and questions required for 'team' scope");
      await updateTeamQuestions(data.team, data.questions, adminId);
      break;
    case "system":
      if (!data.system || !data.questions) throw new Error("System and questions required for 'system' scope");
      await updateSystemQuestions(data.system, data.questions, adminId);
      break;
  }
}
