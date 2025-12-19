import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
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
    await adminAuth.verifySessionCookie(sessionCookie, true);
    
    await adminDb
      .collection("applications")
      .doc(id)
      .collection("notes")
      .doc(noteId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to delete note");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
