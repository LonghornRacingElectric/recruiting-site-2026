"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getFaqConfig, updateFaqConfig } from "@/lib/firebase/config";
import { FaqItem } from "@/lib/models/Config";
import { logger } from "@/lib/logger";


/**
 * GET /api/admin/config/faq
 * Fetch FAQ config (admin access)
 */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getFaqConfig();

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch FAQ config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/config/faq
 * Replace the FAQ list (Admin only). The array order is the display order.
 */
export async function PUT(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }

    // Drop blank entries rather than publishing empty accordion rows, and keep
    // only the fields we model so nothing extra ends up in the document.
    const cleaned: FaqItem[] = items
      .filter((i) => typeof i?.question === "string" && i.question.trim() !== "")
      .map((i, idx) => ({
        id: typeof i.id === "string" && i.id.trim() !== "" ? i.id : `faq_${idx}`,
        question: String(i.question).trim(),
        answer: typeof i.answer === "string" ? i.answer.trim() : "",
      }));

    await updateFaqConfig(cleaned, uid);

    return NextResponse.json({ success: true, count: cleaned.length });
  } catch (error) {
    logger.error(error, "Failed to update FAQ config");

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
