import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getDashboardConfig, updateDashboardConfig } from "@/lib/firebase/config";
import { DashboardDeadline, DashboardResource } from "@/lib/models/Config";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/firebase/audit";


export async function GET() {
  try {
    await requireStaff();
    const config = await getDashboardConfig();
    
    return NextResponse.json(
      { config },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300", // 5-minute cache
        },
      }
    );
  } catch (error) {
    logger.error(error, "Failed to fetch dashboard config");
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
    const { deadlines, resources } = body;

    // Validate deadlines array
    if (deadlines !== undefined && !Array.isArray(deadlines)) {
      return NextResponse.json({ error: "Deadlines must be an array" }, { status: 400 });
    }

    // Validate resources array
    if (resources !== undefined && !Array.isArray(resources)) {
      return NextResponse.json({ error: "Resources must be an array" }, { status: 400 });
    }

    // Validate each deadline
    if (deadlines) {
      for (const deadline of deadlines as DashboardDeadline[]) {
        if (!deadline.id || !deadline.title || !deadline.date) {
          return NextResponse.json(
            { error: "Each deadline must have id, title, and date" },
            { status: 400 }
          );
        }
      }
    }

    // Validate each resource
    if (resources) {
      for (const resource of resources as DashboardResource[]) {
        if (!resource.id || !resource.title || !resource.url) {
          return NextResponse.json(
            { error: "Each resource must have id, title, and url" },
            { status: 400 }
          );
        }
      }
    }

    // Get current config and merge with updates
    const currentConfig = await getDashboardConfig();
    await updateDashboardConfig(
      {
        deadlines: deadlines ?? currentConfig.deadlines,
        resources: resources ?? currentConfig.resources,
      },
      uid
    );
    
    await recordAudit(request, { uid }, { action: "config.update", detail: "dashboard" });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to update dashboard config");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
