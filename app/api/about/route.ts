"use server";

import { NextResponse } from "next/server";
import { getAboutPageConfig } from "@/lib/firebase/config";
import { logger } from "@/lib/logger";


// Cache for 15 minutes (900 seconds), with stale-while-revalidate for 7.5 minutes
const CACHE_MAX_AGE = 900;
const STALE_WHILE_REVALIDATE = 450;

/**
 * GET /api/about
 * Public endpoint to fetch about page content
 * Cached for 15 minutes
 */
export async function GET() {
  try {
    const config = await getAboutPageConfig();
    
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
    logger.error(error, "Failed to fetch about page config");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
