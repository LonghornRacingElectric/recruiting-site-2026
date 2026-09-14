import { InterviewEventStatus } from "@/lib/models/Application";

/**
 * The CLOSE_INTERVIEWS sweep verdict for one application, as a pure predicate.
 *
 * Booking happens on an external link, so offer status is the only record of
 * what happened. In order:
 *  1. An interview that took place is never swept, whatever else is on the
 *     record — a second offer added afterwards used to get the applicant
 *     rejected because they never used the picker.
 *  2. Offers that all ended explicitly (no-show, cancelled) are closed out
 *     for every team; those applicants otherwise sit at "Interview" with a
 *     live signup link through decision day 3.
 *  3. Applicants holding several LIVE (pending) offers who never picked one
 *     never booked anything (every team picks one system — PM, 2026-08-30).
 * A lone PENDING offer is ambiguous (never booked, or interviewed and not
 * yet marked) and is left alone rather than rejected on a guess. Note
 * [no_show, pending] lands there too (pendingCount 1 → spared): the no-show
 * at one system says nothing about the OTHER system's interview. Staff
 * resolve it by marking the pending offer completed/no-show; re-saving the
 * step re-runs the sweep.
 *
 * Shared by the sweep itself (lib/firebase/applications.ts) and the stats
 * module's sweep preview, so the number staff see before the transition is
 * computed by the same rule that fires on it.
 */
export function closeInterviewsWouldReject(
  offerStatuses: string[],
  selectedInterviewSystem: unknown
): boolean {
  if (offerStatuses.length === 0) return false;
  if (offerStatuses.includes(InterviewEventStatus.COMPLETED)) return false;
  const allEnded = offerStatuses.every(
    (s) => s === InterviewEventStatus.NO_SHOW || s === InterviewEventStatus.CANCELLED
  );
  const pendingCount = offerStatuses.filter((s) => s === InterviewEventStatus.PENDING).length;
  const neverPicked = pendingCount > 1 && !selectedInterviewSystem;
  return allEnded || neverPicked;
}
