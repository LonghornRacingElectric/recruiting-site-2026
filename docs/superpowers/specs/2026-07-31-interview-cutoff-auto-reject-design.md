# Interview Cutoff Auto-Reject

## Problem

Applicants who receive an interview offer but never book a time slot currently
just linger in `INTERVIEW` status indefinitely — nothing resolves them. A
previous feature (`autoRejectUnselectedInterviewApplicants`) auto-rejected
Electric/Combustion applicants who had multiple interview offers and never
picked which system to interview for, triggered when any application in the
same team advanced to Trial. That solved a narrower problem (system
selection) and didn't address applicants who never scheduled at all.

This feature replaces that mechanism with a broader one: a dedicated point in
the recruiting cycle where any applicant (any team) who never booked an
interview slot gets auto-rejected.

## What's replaced

Removed entirely:
- `autoRejectUnselectedInterviewApplicants` in `lib/firebase/applications.ts`
- Its call site in `app/api/admin/applications/[id]/status/route.ts` (advance-to-trial branch)
- Its call site in `app/api/admin/applications/bulk-status/route.ts` (`case "trial"`)

## New recruiting step

Add `CLOSE_INTERVIEWS = "close_interviews"` to `RecruitingStep`
(`lib/models/Config.ts`), inserted into the cycle right after `INTERVIEWING`
and before `RELEASE_TRIAL`:

```
OPEN → REVIEWING → RELEASE_INTERVIEWS → INTERVIEWING → CLOSE_INTERVIEWS → RELEASE_TRIAL → TRIAL_WORKDAY → RELEASE_DECISIONS_DAY1 → RELEASE_DECISIONS_DAY2 → RELEASE_DECISIONS_DAY3
```

It must also be inserted at the same position in `STEP_ORDER` in
`lib/utils/statusUtils.ts`, so `isAtOrPast()` and all existing gating logic
(trial-offer eligibility, applicant-visible status masking) account for it
automatically — no other changes needed in that file.

A description entry is added to `STEP_DESCRIPTIONS` in
`app/admin/settings/page.tsx`:

> "Interview scheduling window closed. Applicants who never booked a slot are
> auto-rejected."

The existing step dropdown in the admin settings page already enumerates
`Object.values(RecruitingStep)` generically, so no new UI component is
needed — the new step just appears as an option.

Applicant-visible status masking is unaffected by this step: no existing
`isAtOrPast(..., X)` check in `getUserVisibleStatus` references a step
between `INTERVIEWING` and `RELEASE_TRIAL`, so applicants continue to see
whatever they saw during `INTERVIEWING` until `RELEASE_TRIAL` is reached,
same as today.

## Auto-reject sweep

New function `autoRejectUnscheduledInterviewApplicants()` in
`lib/firebase/applications.ts`:

```ts
export async function autoRejectUnscheduledInterviewApplicants(): Promise<string[]> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("status", "==", ApplicationStatus.INTERVIEW)
    .get();

  const rejectedIds: string[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const offers = normalizeInterviewOffers(data.interviewOffers) || [];

    if (offers.length === 0) continue;

    const hasScheduledOffer = offers.some(
      (o) => o.status === InterviewEventStatus.SCHEDULED || o.status === InterviewEventStatus.COMPLETED
    );
    if (hasScheduledOffer) continue;

    await rejectApplicationFromSystems(doc.id, offers.map((o) => o.system));
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}
```

Key points:
- No team filter — applies to Electric, Combustion, and Solar alike.
- "Scheduled" means offer status `SCHEDULED` or `COMPLETED`. `PENDING`,
  `SCHEDULING`, `CANCELLED`, and `NO_SHOW` all count as "not scheduled" — an
  applicant is only safe if at least one offer reached `SCHEDULED` or
  `COMPLETED`.
- Applications with zero interview offers are skipped (data anomaly, out of
  scope for this sweep).
- Reuses `rejectApplicationFromSystems`, the same function the old sweep and
  manual admin rejection both use, so status/decision-field updates and
  offer-preservation behavior stay consistent with existing rejection
  semantics (interview offers are preserved rather than cleared once past
  `RELEASE_INTERVIEWS`, since `rejectApplicationFromSystems` checks the
  current recruiting step internally).

## Trigger

Wired into `POST /api/admin/config/recruiting`
(`app/api/admin/config/recruiting/route.ts`): after
`updateRecruitingStep(step, uid)` succeeds, if
`step === RecruitingStep.CLOSE_INTERVIEWS`, call
`autoRejectUnscheduledInterviewApplicants()` in a try/catch, logging failures
without blocking the step update response — same non-blocking pattern the
old sweep used at its call sites.

No new admin action or button. Selecting "CLOSE_INTERVIEWS" from the
existing step dropdown and clicking "Update Step" is what fires the sweep.

## Testing

Same approach as the previous auto-reject feature: a throwaway script using
the app's existing `isFakeData`-flagged test-data pattern, run against the
real Firestore project, exercising the real functions directly. Covers:
- An applicant with only unscheduled offers → rejected.
- An applicant with one scheduled offer among several → untouched.
- An applicant with a cancelled offer and nothing else → rejected.
- A Solar applicant with an unscheduled offer → rejected (confirms no team
  exemption, unlike the old feature).
- An applicant with zero interview offers → untouched (skipped, not
  crashed).
