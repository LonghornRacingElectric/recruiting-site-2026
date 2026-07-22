"use server";

import { NextResponse } from "next/server";
import { getFaqConfig } from "@/lib/firebase/config";
import pino from "pino";

const logger = pino();

// Same caching as /api/about — public content that changes rarely.
const CACHE_MAX_AGE = 900;
const STALE_WHILE_REVALIDATE = 450;

/**
 * GET /api/faq
 * Public endpoint to fetch FAQ content. Cached for 15 minutes.
 */
export async function GET() {
  try {
    const config = await getFaqConfig();

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
    logger.error(error, "Failed to fetch FAQ config");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
