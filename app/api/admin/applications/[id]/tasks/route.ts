import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { getUser } from "@/lib/firebase/users";
import { ReviewTask } from "@/lib/models/ApplicationExtras";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import pino from "pino";

const logger = pino();

// GET tasks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    const snapshot = await adminDb
      .collection("applications")
      .doc(id)
      .collection("tasks")
      .orderBy("createdAt", "asc")
      .get();

    const tasks = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
    logger.error(error, "Failed to fetch tasks");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

// POST new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const { description } = body;

    const taskRef = adminDb.collection("applications").doc(id).collection("tasks").doc();

    const taskData: ReviewTask = {
      id: taskRef.id,
      applicationId: id,
      description,
      isCompleted: false,
      createdAt: new Date(),
    };

    await taskRef.set(taskData);

    return NextResponse.json({ task: taskData });
  } catch (error) {
    logger.error(error, "Failed to create task");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
