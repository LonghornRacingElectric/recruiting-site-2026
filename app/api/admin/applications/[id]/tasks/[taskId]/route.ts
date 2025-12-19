import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { ReviewTask } from "@/lib/models/ApplicationExtras";
import pino from "pino";

const logger = pino();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> } // id is appId
) {
  const { id, taskId } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    
    const body = await request.json();
    const { isCompleted } = body;

    const taskRef = adminDb
      .collection("applications")
      .doc(id)
      .collection("tasks")
      .doc(taskId);

    await taskRef.update({
      isCompleted,
      completedBy: isCompleted ? decodedToken.uid : null,
      completedAt: isCompleted ? new Date() : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to update task");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

// DELETE a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await adminAuth.verifySessionCookie(sessionCookie, true);
    
    await adminDb
      .collection("applications")
      .doc(id)
      .collection("tasks")
      .doc(taskId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to delete task");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
