import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getAnnouncement, updateAnnouncement } from "@/lib/firebase/config";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const announcement = await getAnnouncement();
    return NextResponse.json({ announcement }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch announcement");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();
    
    const body = await request.json();
    const { message, enabled } = body;

    if (typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Enabled status is required" }, { status: 400 });
    }

    await updateAnnouncement(message, enabled, uid);
    
    await recordAudit(request, { uid }, { action: "config.update", detail: "announcement" });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to update announcement");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
