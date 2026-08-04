"use server";

import { NextResponse } from "next/server";
import { getContactPageConfig } from "@/lib/firebase/config";
import { logger } from "@/lib/logger";

// Same caching as /api/about and /api/faq — public content that changes rarely.
const CACHE_MAX_AGE = 900;
const STALE_WHILE_REVALIDATE = 450;

/**
 * GET /api/contact
 * Public endpoint to fetch contact page content. Cached for 15 minutes.
 */
export async function GET() {
  try {
    const config = await getContactPageConfig();

    return NextResponse.json(
      { config },
      {
        status: 200,
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        },
      }
    );
  } catch (error) {
    logger.error(error, "Failed to fetch contact page config");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
