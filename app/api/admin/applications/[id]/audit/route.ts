import { NextRequest, NextResponse } from "next/server";
import { requireStaffForApplication } from "@/lib/auth/guard";
import { listAudit } from "@/lib/firebase/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/applications/[id]/audit
 * Who did what to this application, newest first. Same per-record scoping as
 * every other single-application route. Entries carry no applicant PII.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireStaffForApplication(id);
    const entries = await listAudit({ applicationId: id, limit: 200 });
    return NextResponse.json(
      { entries: entries.map((e) => ({ ...e, at: e.at.toISOString() })) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error instanceof Error && error.message === "Application not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logger.error({ err: error, applicationId: id }, "Failed to load application audit");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
