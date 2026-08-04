# Interview scheduling: replace Google Calendar booking with a system-lead signup link

## Problem

Interviews are currently scheduled through a live Google Calendar integration: each
`interviewConfigs` doc (keyed by team+system) holds a `calendarId`, `interviewerEmails`,
duration/buffer/hours, and the app books slots directly (freebusy check, `calendarSlotLocks`
double-booking guard, `createInterviewEvent`). This is being replaced: each system lead will
instead provide a single external signup link (e.g. a Google Calendar Appointment Schedule
page). Applicants pick their interview system as before, then see that system's link with a
"do not distribute" notice, and book on their own outside the app.

## Data model changes

`lib/models/Interview.ts`:
- `InterviewSlotConfig` trimmed to `{ id, team, system, signupLink, updatedAt? }`. Drop
  `calendarId`, `interviewerEmails`, `durationMinutes`, `bufferMinutes`, `availableDays`,
  `availableStartHour`, `availableEndHour`, `timezone`.
- Drop `AvailableSlot`, `ScheduleInterviewRequest`, `ScheduleInterviewResponse` — no longer
  needed once there's no in-app booking.

`lib/models/Application.ts`:
- `InterviewEventStatus`: drop `SCHEDULING` and `SCHEDULED`. These were only ever set by the
  app-owned booking flow. Confirmed unused by `TrialOffer` (which only ever writes `PENDING`
  and never reads `.status`) and never set by the manual admin status action. Keep `PENDING`,
  `CANCELLED`, `COMPLETED`, `NO_SHOW` — these back a real, independent staff feature (see
  below) and must not change.
- `InterviewOffer`: drop `eventId`, `scheduledAt`, `scheduledEndAt`, `scheduledOnDate`.
  Confirmed these are populated only by the deleted booking flow and read only inside
  `InterviewScheduler.tsx` (no admin UI or CSV export depends on them). Keep `system`,
  `status`, `createdAt`, `cancelledAt`, `cancelReason`.
- `TrialOffer` — untouched. Its `status` field is vestigial (always `PENDING`, never read);
  this change doesn't touch trial-day logic at all.

## Backend changes

- Delete `lib/google/calendar.ts` entirely. Confirmed its only callers are the two interview
  API routes and the admin config page's calendar picker — nothing trial-related depends on
  it.
- Delete `acquireCalendarSlotLock`, `confirmCalendarSlotLock`, `releaseCalendarSlotLock`,
  `reserveInterviewSlot`, `confirmInterviewReservation` from `lib/firebase/applications.ts`.
- `selectInterviewSystem()` (`lib/firebase/applications.ts:581`): after setting
  `selectedInterviewSystem` and narrowing `preferredSystems` (unchanged), also mark every
  other still-`PENDING` offer `CANCELLED` with
  `cancelReason: "Applicant selected a different system for interview"`. This replaces the
  auto-decline that used to fire in the schedule route on successful booking — system
  selection is now the only real commitment moment, so the decline has to happen there.
- `autoRejectUnscheduledInterviewApplicants()` (`lib/firebase/applications.ts:1197`):
  redefine the bar from "has an offer with status SCHEDULED/COMPLETED" to "has picked an
  interview system" (`selectedInterviewSystem` is set) for Electric/Combustion. **Exempt
  Solar** from this sweep — Solar never requires system selection (applicants can hold
  multiple simultaneous offers) and the app has no way to verify an external booking
  happened, so there's no reliable signal left for Solar. This matches the older
  system-selection-based sweep this feature originally replaced, which also exempted Solar.
- Delete `app/api/applications/[id]/interview/schedule/route.ts` entirely — no in-app
  booking or cancel-booking action exists anymore.
- `app/api/applications/[id]/interview/route.ts` GET: for each offer, look up `signupLink`
  from `interviewConfigs` (existing team+system lookup, doc-ID-first then query fallback —
  unchanged) instead of calling `getAvailableSlots`. Response becomes
  `{ team, offers: [{ system, status, signupLink?, configMissing }], selectedSystem,
  needsSystemSelection }`. POST (system selection) unchanged except for the new decline
  side-effect above.
- `lib/actions/interview-config.ts`: `createInterviewConfig`/`updateInterviewConfig` now
  read/write just `{ team, system, signupLink }`. RBAC (admin sees all, captain sees team,
  system lead sees own team+system) is unchanged.
- `app/admin/configuration/page.tsx`: drop the `listAccessibleCalendars` call and the
  `calendars` prop passed down to the interviews tab.

## Frontend changes

- `InterviewConfigForm.tsx`: replace the calendar picker, duration/buffer inputs,
  available-days toggle row, interviewer picker, and timezone display with a single URL
  input (`signupLink`) with basic client-side URL validation, plus save. Keep the existing
  panel chrome, the "changes may take up to 10 minutes" cache-delay banner, and the
  `InitializeSystemButton`/`CreateConfigModal` flows as-is (they just create/select the
  simplified config doc now).
- `InterviewScheduler.tsx`:
  - "Select Your Interview System" screen (Electric/Combustion, >1 offer, no selection yet):
    unchanged.
  - Per-offer display, replacing the day-grouped slot picker and Confirm/Cancel-booking UI:
    - `PENDING` offer with a `signupLink`: a card with the system name, a "Do not
      distribute" warning banner (reuse the amber/orange semantic style already established
      in `InterviewsTab.tsx:37-47`), the link rendered as copy-able text plus an "Open
      signup form ↗" button (`target="_blank" rel="noopener noreferrer"`).
    - `PENDING` offer with `configMissing`: reuse the existing "not available yet" /
      config-missing empty state pattern (`InterviewsTab.tsx:71-102` style, orange
      `AlertTriangle` card).
    - `CANCELLED`/`COMPLETED`/`NO_SHOW` offers: simple status-only display, no link (staff
      sets these manually; matches current admin styling conventions).
  - Remove `scheduleInterview`/cancel-booking handlers and the slot-picker UI — there is no
    in-app booking action anymore.
- `hooks/useInterviewData.ts`: update `InterviewOfferWithSlots`/`InterviewDataResponse`
  types to match — drop `availableSlots`, add `signupLink?`/`configMissing`.

## Explicitly out of scope / unaffected

- Trial-day scheduling (`app/api/applications/[id]/trial/respond`,
  `TrialOffer.accepted`/`respondedAt`/`rejectionReason`) — entirely separate mechanism, not
  calendar-based, untouched.
- The manual staff "mark interview Completed / Cancelled / No-show" action in
  `ApplicationDetail.tsx:454-486, 1608-1644` and its backing route
  `app/api/admin/applications/[id]/interview/[system]/route.ts` — independent of the booking
  mechanism, works identically after this change.
- `CLAUDE.md`'s stack line "Google Calendar API (interview scheduling)" will be updated to
  reflect that Google Calendar is no longer used for interviews (trial scheduling doesn't use
  it either, per investigation — so the mention can be dropped or reworded).

## Risks / things a reviewer should double check during planning

- `selectInterviewSystem` throws if `application.team === Team.SOLAR` — Solar flow is
  untouched by this design (still no selection required, still multiple simultaneous offers
  each getting their own signup link).
- Need to confirm during implementation whether any other code path sets
  `InterviewEventStatus.SCHEDULED` or reads `offer.scheduledAt`/`eventId` beyond what was
  found here (search was thorough but not exhaustive of every admin CSV/export path).
