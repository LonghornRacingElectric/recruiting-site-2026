import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { UserRole, Team } from "@/lib/models/User";
import { ApplicationStatus } from "@/lib/models/Application";
import { systemPending } from "@/lib/utils/systemPending";
import { logger } from "@/lib/logger";


interface PendingCounts {
  // Pre-interview: applications needing initial review
  pendingReviews: {
    total: number;
    byGroup: Record<string, number>; // For admin: by team, for team captain: by system
  };
  // Post-interview: applications with interview but no final decision
  pendingDecisions: {
    total: number;
    byGroup: Record<string, number>;
  };
}

export async function GET() {
  try {
    const { user } = await requireStaff();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userTeam = user.memberProfile?.team;
    const userSystem = user.memberProfile?.system;

    const counts: PendingCounts = {
      pendingReviews: { total: 0, byGroup: {} },
      pendingDecisions: { total: 0, byGroup: {} },
    };

    // Build query based on role
    let applicationsRef = adminDb.collection("applications") as FirebaseFirestore.Query;

    switch (user.role) {
      case UserRole.ADMIN:
        // Admin sees everything, grouped by team
        const allDocs = await applicationsRef.get();
        
        for (const doc of allDocs.docs) {
          const app = doc.data();
          const team = app.team as string;
          
          // Count pending reviews (submitted but no review decision yet)
          if (app.status === ApplicationStatus.SUBMITTED && !app.reviewDecision) {
            counts.pendingReviews.total++;
            counts.pendingReviews.byGroup[team] = (counts.pendingReviews.byGroup[team] || 0) + 1;
          }
          
          // Count pending decisions (has interview/trial but no final status)
          if (
            (app.status === ApplicationStatus.INTERVIEW || app.status === ApplicationStatus.TRIAL) &&
            app.status !== ApplicationStatus.ACCEPTED &&
            app.status !== ApplicationStatus.REJECTED
          ) {
            counts.pendingDecisions.total++;
            counts.pendingDecisions.byGroup[team] = (counts.pendingDecisions.byGroup[team] || 0) + 1;
          }
        }
        break;

      case UserRole.TEAM_CAPTAIN_OB:
        // Team captain sees their team, grouped by system
        if (!userTeam) {
          return NextResponse.json({ error: "Team profile missing" }, { status: 403 });
        }
        
        const teamDocs = await applicationsRef
          .where("team", "==", userTeam)
          .get();
        
        for (const doc of teamDocs.docs) {
          const app = doc.data();
          const systems = (app.preferredSystems as string[]) || [];
          // Per system: what each system still has to decide. The total is
          // applications with at least one system yet to decide.
          let anyReview = false, anyDecision = false;
          for (const system of systems) {
            const pending = systemPending(app, system);
            if (pending.review) { anyReview = true; counts.pendingReviews.byGroup[system] = (counts.pendingReviews.byGroup[system] || 0) + 1; }
            if (pending.decision) { anyDecision = true; counts.pendingDecisions.byGroup[system] = (counts.pendingDecisions.byGroup[system] || 0) + 1; }
          }
          // A submitted application with no ranking is invisible to every lead
          // (array-contains); the captain's total is the one place it surfaces.
          if (systems.length === 0 && app.status === ApplicationStatus.SUBMITTED && !app.reviewDecision) anyReview = true;
          if (anyReview) counts.pendingReviews.total++;
          if (anyDecision) counts.pendingDecisions.total++;
        }
        break;

      case UserRole.SYSTEM_LEAD:
      case UserRole.REVIEWER:
        // System lead/reviewer sees only their system
        if (!userTeam || !userSystem) {
          return NextResponse.json({ error: "System profile missing" }, { status: 403 });
        }
        
        const systemDocs = await applicationsRef
          .where("team", "==", userTeam)
          .where("preferredSystems", "array-contains", userSystem)
          .get();
        
        for (const doc of systemDocs.docs) {
          // Only what THIS system still has to decide (#131): an application
          // this system already rejected, or already offered, is not pending
          // here even while other systems are still working on it.
          const pending = systemPending(doc.data(), userSystem);
          if (pending.review) counts.pendingReviews.total++;
          if (pending.decision) counts.pendingDecisions.total++;
        }
        // For system lead/reviewer, byGroup is just their system
        counts.pendingReviews.byGroup[userSystem] = counts.pendingReviews.total;
        counts.pendingDecisions.byGroup[userSystem] = counts.pendingDecisions.total;
        break;

      default:
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    return NextResponse.json({ counts }, { status: 200 });
  } catch (error) {
    logger.error(error, "Failed to fetch pending counts");
    if (error instanceof Error && (error.message === "Unauthorized" || error.message.includes("Forbidden"))) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
