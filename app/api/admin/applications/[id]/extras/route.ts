import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getUserApplications } from "@/lib/firebase/applications";
import { UserRole } from "@/lib/models/User";
import pino from "pino";

const logger = pino();

/**
 * GET /api/admin/applications/[id]/extras
 * Combined endpoint that returns notes, tasks, and related applications
 * for a single application in one request.
 * 
 * Query params:
 *   - userId: Required. The userId of the application owner (to find related apps)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { user } = await requireStaff();
    await adminAuth.verifySessionCookie(sessionCookie, true);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get userId from query params to avoid refetching the application
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query param required" }, { status: 400 });
    }

    // Fetch notes, tasks, and related applications in parallel
    const [notesSnapshot, tasksSnapshot, allUserApplications] = await Promise.all([
      adminDb
        .collection("applications")
        .doc(id)
        .collection("notes")
        .orderBy("createdAt", "desc")
        .get(),
      adminDb
        .collection("applications")
        .doc(id)
        .collection("tasks")
        .orderBy("createdAt", "asc")
        .get(),
      getUserApplications(userId),
    ]);

    // Process notes
    const notes = notesSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));

    // Process tasks
    const tasks = tasksSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));

    // Filter and process related applications
    const relatedApplications = allUserApplications
      .filter(app => app.id !== id)
      .map(app => {
        const isAdmin = user.role === UserRole.ADMIN;
        if (isAdmin) {
          return {
            id: app.id,
            team: app.team,
            status: app.status,
            preferredSystems: app.preferredSystems || [],
          };
        } else {
          return {
            team: app.team,
            status: app.status,
            preferredSystems: app.preferredSystems || [],
          };
        }
      });

    return NextResponse.json({
      notes,
      tasks,
      relatedApplications,
    });

  } catch (error) {
    logger.error(error, "Failed to fetch application extras");
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
