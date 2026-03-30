import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import pino from "pino";

const logger = pino();

// DELETE a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const user = await getUser(decodedToken.uid);

    // Fetch the application and check team access
    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const teamAccessError = checkTeamAccess(user, application);
    if (teamAccessError) {
      return NextResponse.json({ error: teamAccessError }, { status: 403 });
    }

    await adminDb
      .collection("applications")
      .doc(id)
      .collection("notes")
      .doc(noteId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to delete note");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
