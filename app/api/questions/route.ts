"use server";

import { NextRequest, NextResponse } from "next/server";
import { getApplicationQuestions } from "@/lib/firebase/config";
import { Team } from "@/lib/models/User";
import { appCache } from "@/lib/utils/appCache";
import pino from "pino";

const logger = pino();

// Cache the questions for 2 hours (7200 seconds), with stale-while-revalidate for 1 hour
const CACHE_MAX_AGE = 7200;
const STALE_WHILE_REVALIDATE = 3600;

/**
 * GET /api/questions
 * Public endpoint to fetch application questions for applicants
 * Optional query param: ?team=Electric|Solar|Combustion
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamParam = searchParams.get("team");

    // Try server-side cache first
    let config = appCache.getQuestions();
    
    if (!config) {
      config = await getApplicationQuestions();
      appCache.setQuestions(config);
    }
    
    // If team is specified, return only that team's questions along with common questions
    if (teamParam && Object.values(Team).includes(teamParam as Team)) {
      const teamQuestions = config.teamQuestions[teamParam] || [];
      const systemQuestions = config.systemQuestions || {};
      
      return NextResponse.json(
        { 
          commonQuestions: config.commonQuestions,
          teamQuestions,
          systemQuestions,
          updatedAt: config.updatedAt,
        },
        { 
          status: 200,
          headers: {
            'Cache-Control': `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
          },
        }
      );
    }

    // Return all questions if no team specified
    return NextResponse.json(
      { config },
      { 
        status: 200,
        headers: {
          'Cache-Control': `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  } catch (error) {
    logger.error(error, "Failed to fetch application questions");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
