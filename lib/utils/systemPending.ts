import { ApplicationStatus, InterviewEventStatus } from "@/lib/models/Application";

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
 *
 * Shared by the dashboard pending-count route and the stats module so the
 * numbers a lead sees on the dashboard and the numbers on /admin/stats can
 * never drift apart (the lesson of #131/#132 — this predicate used to live
 * inline in one route).
 */
export function systemPending(
  app: FirebaseFirestore.DocumentData,
  system: string
): { review: boolean; decision: boolean } {
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
