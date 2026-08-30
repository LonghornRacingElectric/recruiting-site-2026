import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/guard";
import { adminDb } from "@/lib/firebase/admin";
import { UserRole, Team } from "@/lib/models/User";
import { ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";
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

/**
 * What one system still has to decide on an application (#131). The global
 * status is the applicant's pipeline stage — a per-system rejection leaves it
 * `submitted` until every ranked system has rejected, and another system's
 * offer moves it to `interview` — so for a lead or reviewer the count has to
 * be per-system, the same lens as the applicants list (#126):
 *  - review pending: the application is still in play (submitted, interview
 *    or trial stage) and this system has neither rejected it nor extended an
 *    offer — another system's advance does not review it for us;
 *  - decision pending: this system's interview offer is out with no
 *    rejection or trial offer after it, or this system's trial offer is out
 *    and the final decision has not been made.
 * A cancelled offer is no offer; completed and no-show offers still stand.
 */
function systemPending(app: FirebaseFirestore.DocumentData, system: string): { review: boolean; decision: boolean } {
  const live = (o: { system?: string; status?: string }) => o.system === system && o.status !== InterviewEventStatus.CANCELLED;
  const rejected = ((app.rejectedBySystems as string[] | undefined) || []).includes(system);
  const interviewOffer = ((app.interviewOffers as { system?: string; status?: string }[] | undefined) || []).some(live);
  const trialOffer = ((app.trialOffers as { system?: string; status?: string }[] | undefined) || []).some(live);
  const S = ApplicationStatus;
  const inPlay = app.status === S.SUBMITTED || app.status === S.INTERVIEW || app.status === S.TRIAL;
  const review = inPlay && !rejected && !interviewOffer && !trialOffer;
  const decision =
    !rejected &&
    ((app.status === S.INTERVIEW && interviewOffer && !trialOffer) ||
      (app.status === S.TRIAL && trialOffer && !app.trialDecision) ||
      (app.status === S.TRIAL && interviewOffer && !trialOffer));
  return { review, decision };
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
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
