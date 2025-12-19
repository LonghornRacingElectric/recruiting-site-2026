import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { Team } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * PATCH /api/admin/applications/[id]
 * Update application fields (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    
    const body = await request.json();
    const { team, preferredSystems, formData } = body;

    const docRef = adminDb.collection("applications").doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const currentData = doc.data();
    
    // Build update object
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    // Update team if provided and valid
    if (team && Object.values(Team).includes(team)) {
      updates.team = team;
    }

    // Update preferred systems if provided
    if (preferredSystems) {
      updates.preferredSystems = preferredSystems;
      // Also update deprecated field for compatibility
      updates.preferredSystem = preferredSystems[0] || null;
    }

    // Update form data fields if provided
    if (formData) {
      const currentFormData = currentData?.formData || {};
      updates.formData = {
        ...currentFormData,
        ...formData,
      };
    }

    await docRef.update(updates);

    // Fetch updated application
    const updatedDoc = await docRef.get();
    const application = { id: updatedDoc.id, ...updatedDoc.data() };

    return NextResponse.json({ application }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to update application");
    
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (error instanceof Error && error.message.includes("Admin")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
