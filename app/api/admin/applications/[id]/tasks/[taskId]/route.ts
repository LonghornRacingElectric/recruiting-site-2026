import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { ReviewTask } from "@/lib/models/ApplicationExtras";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
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
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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
      .collection("tasks")
      .doc(taskId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(error, "Failed to delete task");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
