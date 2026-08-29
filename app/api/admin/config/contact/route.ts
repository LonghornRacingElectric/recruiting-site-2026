"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getContactPageConfig, updateContactPageConfig } from "@/lib/firebase/config";
import { ContactChannel } from "@/lib/models/Config";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";

/**
 * GET /api/admin/config/contact
 * Fetch contact page config (admin access)
 */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getContactPageConfig();

    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch contact page config");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/config/contact
 * Update the contact page (Admin only).
 */
export async function PUT(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();

    const body = await request.json();
    const { intro, email, emailDescription, channels, ctaHeading, ctaText } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Keep only modeled fields; drop channels without a name or URL.
    const cleanedChannels: ContactChannel[] = (Array.isArray(channels) ? channels : [])
      .filter((c) => typeof c?.name === "string" && c.name.trim() !== "" && typeof c?.url === "string" && c.url.trim() !== "")
      .map((c, idx) => ({
        id: typeof c.id === "string" && c.id.trim() !== "" ? c.id : `channel_${idx}`,
        name: String(c.name).trim(),
        handle: typeof c.handle === "string" ? c.handle.trim() : "",
        url: String(c.url).trim(),
        description: typeof c.description === "string" ? c.description.trim() : "",
      }));

    await updateContactPageConfig(
      {
        intro: typeof intro === "string" ? intro.trim() : "",
        email: email.trim(),
        emailDescription: typeof emailDescription === "string" ? emailDescription.trim() : "",
        channels: cleanedChannels,
        ctaHeading: typeof ctaHeading === "string" ? ctaHeading.trim() : "",
        ctaText: typeof ctaText === "string" ? ctaText.trim() : "",
      },
      uid
    );

    await recordAudit(request, { uid }, { action: "config.update", detail: "contact" });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to update contact page config");

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
