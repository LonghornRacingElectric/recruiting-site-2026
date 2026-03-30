import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getApplication } from "@/lib/firebase/applications";
import { Note } from "@/lib/models/ApplicationExtras";
import { getUser } from "@/lib/firebase/users";
import { checkTeamAccess } from "@/lib/auth/teamAccess";
import pino from "pino";

const logger = pino();

// GET notes for an application
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
      .collection("notes")
      .orderBy("createdAt", "desc")
      .get();

    const notes = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));

    return NextResponse.json({ notes });
  } catch (error) {
    logger.error(error, "Failed to fetch notes");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

// POST a new note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionCookie = request.cookies.get("session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const user = await getUser(decodedToken.uid); // Fetch full user profile for name

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
    const { content } = body;

    if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 });

    const noteRef = adminDb.collection("applications").doc(id).collection("notes").doc();

    const noteData: Note = {
      id: noteRef.id,
      applicationId: id,
      authorId: decodedToken.uid,
      authorName: user?.name || "Unknown",
      content,
      createdAt: new Date(),
    };

    await noteRef.set({
      ...noteData,
      createdAt: new Date(), // Use server timestamp in real app usually, but date object ok for simple cases
    });

    return NextResponse.json({ note: noteData });
  } catch (error) {
    logger.error(error, "Failed to create note");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
