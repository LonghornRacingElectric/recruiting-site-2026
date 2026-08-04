# Interview Signup Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Calendar-based interview booking flow with a per-system external signup link that system leads manage; applicants see their assigned system's link (with a "do not distribute" warning) instead of an in-app slot picker.

**Architecture:** Trim the `InterviewSlotConfig`/`InterviewOffer`/`InterviewEventStatus` data models down to what a link-based flow needs, delete the Google Calendar integration and the in-app booking route, teach the applicant-facing GET route to resolve a signup link instead of available slots, and rewrite the two UI surfaces (admin config form, applicant scheduler) around that link. The staff "mark interview Completed/Cancelled/No-show" action and all trial-day logic are untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Admin SDK (Firestore), SWR, Tailwind (inline `style={{}}` for brand colors), `react-hot-toast`, `lucide-react` icons.

## Global Constraints

- No test suite and no lint script exist in this repo. `npm run build` is the verification step for every task — run it after each task's changes and confirm it exits 0 with no new type errors.
- Design spec: `docs/superpowers/specs/2026-08-03-interview-signup-link-design.md` — refer back to it if a step here seems to contradict it (it shouldn't; this plan was derived from it).
- Do not touch trial-day scheduling (`app/api/applications/[id]/trial/respond`, `TrialOffer`) or the manual admin "mark Completed/Cancelled/No-show" action (`app/admin/applications/_components/ApplicationDetail.tsx:454-486,1608-1644`, `app/api/admin/applications/[id]/interview/[system]/route.ts`) — both are confirmed independent of this change.
- Commit messages: conventional prefix + short lowercase imperative subject (e.g. `feat: replace interview booking with signup link`), no body unless necessary, no AI attribution. Commit after each task.

---

### Task 1: Trim the data models

**Files:**
- Modify: `lib/models/Interview.ts` (whole file)
- Modify: `lib/models/Application.ts:18-44` (the `InterviewEventStatus` enum and `InterviewOffer` interface)

**Interfaces:**
- Produces: `InterviewSlotConfig { id: string; team: Team; system: string; signupLink: string }` — consumed by Tasks 2, 3, 4.
- Produces: `InterviewEventStatus` enum with exactly `PENDING | CANCELLED | COMPLETED | NO_SHOW` — consumed by Tasks 2, 3, 5.
- Produces: `InterviewOffer { system: string; status: InterviewEventStatus; createdAt: Date; cancelledAt?: Date; cancelReason?: string }` — consumed by Tasks 2, 3, 5.

- [ ] **Step 1: Replace `lib/models/Interview.ts`**

```ts
import { Team } from "./User";

/**
 * Interview signup link configuration for each team/system.
 * Stored in the `interviewConfigs` Firestore collection.
 */
export interface InterviewSlotConfig {
  id: string;                          // Document ID (e.g., "electric-electronics")
  team: Team;
  system: string;                       // System name (e.g., "Electronics")
  signupLink: string;                   // External signup link the system lead manages (e.g. a Google Calendar Appointment Schedule page)
}
```

- [ ] **Step 2: Trim `InterviewEventStatus` and `InterviewOffer` in `lib/models/Application.ts`**

Replace lines 18-44 (from `// Calendar event status tracking` through the closing `}` of `InterviewOffer`):

```ts
// Interview offer status. Staff set COMPLETED/CANCELLED/NO_SHOW manually
// (see app/api/admin/applications/[id]/interview/[system]/route.ts) since
// booking happens on an external signup link the app doesn't control.
export enum InterviewEventStatus {
  PENDING = "pending",           // Offer extended, not yet declined/resolved
  CANCELLED = "cancelled",       // Declined by applicant (chose another system) or cancelled by staff
  COMPLETED = "completed",       // Interview took place
  NO_SHOW = "no_show",           // Applicant didn't show up
}

export interface InterviewOffer {
  system: string;                      // The system offering the interview (e.g., "Electronics")
  status: InterviewEventStatus;
  createdAt: Date;                     // When offer was created by admin
  cancelledAt?: Date;                  // When cancelled (if applicable)
  cancelReason?: string;               // Reason for cancellation
}
```

Leave `TrialOffer` (the next interface in the file) untouched — it still uses `InterviewEventStatus` but only ever writes `PENDING`.

- [ ] **Step 3: Verify the build catches every downstream usage**

Run: `npm run build`
Expected: FAILS with type errors in `lib/firebase/applications.ts`, `lib/actions/interview-config.ts` callers, `lib/google/calendar.ts`, `app/api/applications/[id]/interview/route.ts`, `app/api/applications/[id]/interview/schedule/route.ts`, `app/admin/configuration/*.tsx`, `components/InterviewScheduler.tsx`, `hooks/useInterviewData.ts`. This is expected — Tasks 2-5 fix each site. Skim the error list once so you know nothing outside those files is affected.

- [ ] **Step 4: Commit**

```bash
git add lib/models/Interview.ts lib/models/Application.ts
git commit -m "refactor: trim interview data models to signup-link shape"
```

---

### Task 2: Rework interview offer logic in `lib/firebase/applications.ts`

**Files:**
- Modify: `lib/firebase/applications.ts`

**Interfaces:**
- Consumes: `InterviewSlotConfig`, `InterviewEventStatus`, `InterviewOffer` from Task 1.
- Produces: `selectInterviewSystem(applicationId, system): Promise<Application | null>` — now also declines every other pending offer. Consumed by `app/api/applications/[id]/interview/route.ts` (unchanged call site, Task 3).
- Produces: `updateInterviewOfferStatus(applicationId, system, { status, cancelReason? }): Promise<Application | null>` — signature drops `eventId`/`scheduledAt`/`scheduledEndAt`. Consumed by `app/api/admin/applications/[id]/interview/[system]/route.ts` (unchanged call site — that route only ever passes `status`/`cancelReason`, so no edit needed there).
- Produces: `autoRejectUnscheduledInterviewApplicants(): Promise<string[]>` — bar redefined to "has picked an interview system", Solar exempt.
- Removes: `reserveInterviewSlot`, `confirmInterviewReservation`, `rollbackInterviewReservation`, `acquireCalendarSlotLock`, `confirmCalendarSlotLock`, `releaseCalendarSlotLock`, `isCalendarSlotAvailable`, `getCalendarSlotLockId`, `CalendarSlotLockStatus`, `CalendarSlotLock`, `CALENDAR_SLOT_LOCKS_COLLECTION`.

- [ ] **Step 1: Remove the now-unused `CALENDAR_SLOT_LOCKS_COLLECTION` constant**

At the top of the file, delete this line:

```ts
const CALENDAR_SLOT_LOCKS_COLLECTION = "calendarSlotLocks";
```

- [ ] **Step 2: Trim `convertInterviewOfferDates`**

Replace:

```ts
function convertInterviewOfferDates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any
): InterviewOffer {
  return {
    ...offer,
    createdAt: safeToDate(offer.createdAt) || new Date(),
    scheduledAt: safeToDate(offer.scheduledAt),
    scheduledEndAt: safeToDate(offer.scheduledEndAt),
    scheduledOnDate: safeToDate(offer.scheduledOnDate),
    cancelledAt: safeToDate(offer.cancelledAt),
  };
```

with:

```ts
function convertInterviewOfferDates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any
): InterviewOffer {
  return {
    ...offer,
    createdAt: safeToDate(offer.createdAt) || new Date(),
    cancelledAt: safeToDate(offer.cancelledAt),
  };
```

(the closing `}` on the next line stays as-is).

- [ ] **Step 3: Trim `prepareOfferForFirestore`**

Replace:

```ts
function prepareOfferForFirestore(offer: InterviewOffer): Record<string, unknown> {
  return stripUndefined({
    system: offer.system,
    status: offer.status,
    eventId: offer.eventId,
    scheduledAt: offer.scheduledAt,
    scheduledEndAt: offer.scheduledEndAt,
    createdAt: offer.createdAt,
    scheduledOnDate: offer.scheduledOnDate,
    cancelledAt: offer.cancelledAt,
    cancelReason: offer.cancelReason,
  });
}
```

with:

```ts
function prepareOfferForFirestore(offer: InterviewOffer): Record<string, unknown> {
  return stripUndefined({
    system: offer.system,
    status: offer.status,
    createdAt: offer.createdAt,
    cancelledAt: offer.cancelledAt,
    cancelReason: offer.cancelReason,
  });
}
```

- [ ] **Step 4: Make `selectInterviewSystem` decline every other pending offer**

Replace the whole function:

```ts
export async function selectInterviewSystem(
  applicationId: string,
  system: string
): Promise<Application | null> {
  const application = await getApplication(applicationId);
  if (!application) {
    return null;
  }

  // Verify the system is in the offers
  const offers = application.interviewOffers || [];
  if (!offers.some((o) => o.system === system)) {
    throw new Error(`No interview offer found for system: ${system}`);
  }

  // Verify this is for Combustion or Electric (not Solar)
  if (application.team === Team.SOLAR) {
    throw new Error("Solar team does not require system selection - all systems can be interviewed");
  }

  // Decline every other still-pending offer — the applicant is committing to
  // `system`, and booking happens externally, so this is the only moment the
  // app can record that choice (this used to happen on successful calendar
  // booking; there is no booking step anymore).
  const updatedOffers = offers.map((offer) =>
    offer.system === system || offer.status !== InterviewEventStatus.PENDING
      ? offer
      : {
          ...offer,
          status: InterviewEventStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: "Applicant selected a different system for interview",
        }
  );

  // Narrow preferredSystems to the chosen system. Reviewer/system-lead visibility
  // (checkTeamAccess, requireStaffForApplication, and the system-scoped Firestore
  // queries in this file) all key off preferredSystems array-contains, so this is
  // what actually hides the applicant from the systems they didn't pick.
  return updateApplication(applicationId, {
    selectedInterviewSystem: system,
    preferredSystems: [system as ElectricSystem | SolarSystem | CombustionSystem],
    interviewOffers: updatedOffers,
  });
}
```

- [ ] **Step 5: Trim `updateInterviewOfferStatus`**

Replace the whole function:

```ts
export async function updateInterviewOfferStatus(
  applicationId: string,
  system: string,
  statusUpdate: {
    status: InterviewEventStatus;
    cancelReason?: string;
  }
): Promise<Application | null> {
  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const offers = normalizeInterviewOffers(data.interviewOffers) || [];
    const offerIndex = offers.findIndex((o) => o.system === system);

    if (offerIndex === -1) {
      throw new Error(`No interview offer found for system: ${system}`);
    }

    const updatedOffer: InterviewOffer = {
      ...offers[offerIndex],
      status: statusUpdate.status,
    };

    if (statusUpdate.status === InterviewEventStatus.CANCELLED) {
      updatedOffer.cancelledAt = new Date();
      updatedOffer.cancelReason = statusUpdate.cancelReason;
    }

    const updatedOffers = [...offers];
    updatedOffers[offerIndex] = updatedOffer;

    transaction.update(applicationRef, {
      interviewOffers: updatedOffers.map(prepareOfferForFirestore),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Return the updated application data
    return {
      ...data,
      id: doc.id,
      interviewOffers: updatedOffers,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });
}
```

- [ ] **Step 6: Delete the calendar-reservation and slot-lock block**

Delete everything from the `/** * Reserve an interview slot atomically...` comment through the end of `isCalendarSlotAvailable` — i.e. every one of: `reserveInterviewSlot`, `confirmInterviewReservation`, `rollbackInterviewReservation`, the `getCalendarSlotLockId` helper, the `CalendarSlotLockStatus` enum, the `CalendarSlotLock` interface, `acquireCalendarSlotLock`, `confirmCalendarSlotLock`, `releaseCalendarSlotLock`, and `isCalendarSlotAvailable`. None of these are called from anywhere outside this file and the route deleted in Task 3 — confirmed by grep across `app/`, `lib/`, `components/`, `hooks/`.

The function immediately before this block is `updateInterviewOfferStatus` (which you just edited in Step 5 — its closing `}` is the line right before the `/** * Reserve an interview slot atomically...` comment). The function immediately after the deleted block is `rejectApplicationFromSystems` (`/** * Reject an applicant from specific systems atomically. ...`) — leave that one alone. You're deleting a contiguous block bounded exactly by those two untouched functions.

- [ ] **Step 7: Redefine `autoRejectUnscheduledInterviewApplicants`**

Replace the whole function (including its docstring):

```ts
/**
 * Auto-reject applicants who never committed to an interview system.
 * Booking now happens on an external signup link the app doesn't control, so
 * "scheduled" can no longer be verified — the closest available signal is
 * whether the applicant picked a system (selectedInterviewSystem). Solar is
 * exempt: it never requires system selection (applicants can hold multiple
 * simultaneous offers), so there's no equivalent signal for it — matches the
 * older system-selection sweep this feature replaced, which also exempted
 * Solar.
 *
 * Intended to run when the recruiting cycle moves into CLOSE_INTERVIEWS,
 * marking the end of the interview scheduling window.
 */
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
    if (data.team === Team.SOLAR) continue;
    if (data.selectedInterviewSystem) continue;

    await rejectApplicationFromSystems(doc.id, offers.map((o) => o.system));
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: no more type errors originating from `lib/firebase/applications.ts` itself. Errors will remain in `lib/google/calendar.ts`, `lib/actions/interview-config.ts` call sites, `app/api/applications/[id]/interview/*`, admin config UI, and `components/InterviewScheduler.tsx`/`hooks/useInterviewData.ts` — all fixed in later tasks.

- [ ] **Step 9: Commit**

```bash
git add lib/firebase/applications.ts
git commit -m "refactor: drop calendar booking logic, decline offers on system selection"
```

---

### Task 3: Delete the Google Calendar integration and booking route; serve the signup link

**Files:**
- Delete: `lib/google/calendar.ts`
- Delete: `app/api/applications/[id]/interview/schedule/route.ts` (and the now-empty `schedule/` directory)
- Modify: `app/api/applications/[id]/interview/route.ts` (GET handler + imports)
- Modify: `app/admin/configuration/page.tsx` (drop calendar listing)

**Interfaces:**
- Consumes: `InterviewSlotConfig` (Task 1), `updateInterviewOfferStatus`/`selectInterviewSystem` (Task 2, unchanged call sites here).
- Produces: `GET /api/applications/[id]/interview` response shape `{ team, offers: Array<InterviewOffer & { signupLink?: string; configMissing?: boolean; error?: string }>, selectedSystem, needsSystemSelection }` — consumed by `hooks/useInterviewData.ts` (Task 5).

- [ ] **Step 1: Delete the calendar integration file**

```bash
git rm lib/google/calendar.ts
```

- [ ] **Step 2: Delete the booking route**

```bash
git rm app/api/applications/\[id\]/interview/schedule/route.ts
rmdir "app/api/applications/[id]/interview/schedule" 2>/dev/null || true
```

- [ ] **Step 3: Rewrite the GET handler in `app/api/applications/[id]/interview/route.ts`**

Remove this import line:

```ts
import { getAvailableSlots } from "@/lib/google/calendar";
```

Replace the `offersWithSlots` block (from `// Get available slots for the relevant offer(s)` through the `return NextResponse.json({...})` that follows it, i.e. lines 122-169 of the original file) with:

```ts
    // Resolve the signup link for the relevant offer(s)
    const offersWithLinks = await Promise.all(
      interviewOffers.map(async (offer) => {
        // For Combustion/Electric with selection, only surface the selected system
        if (
          application.team !== Team.SOLAR &&
          selectedSystem &&
          offer.system !== selectedSystem
        ) {
          return { ...offer };
        }

        // Only PENDING offers need a link — CANCELLED/COMPLETED/NO_SHOW are
        // just status displays now, no booking action attached to them.
        if (offer.status !== InterviewEventStatus.PENDING) {
          return { ...offer };
        }

        try {
          const config = await getInterviewConfig(application.team, offer.system);
          if (!config || !config.signupLink) {
            return { ...offer, configMissing: true };
          }

          return { ...offer, signupLink: config.signupLink };
        } catch (error) {
          logger.error({ err: error, system: offer.system }, "Failed to load interview config");
          return { ...offer, error: "Failed to load signup link" };
        }
      })
    );

    return NextResponse.json({
      team: application.team,
      offers: offersWithLinks,
      selectedSystem,
      needsSystemSelection,
    });
```

Leave the local `getInterviewConfig` helper (the doc-ID-first-then-query lookup) and the POST handler untouched — the POST handler already calls `selectInterviewSystem`, whose new decline-others behavior lives entirely in Task 2's edit.

- [ ] **Step 4: Drop the calendar listing in the admin config page**

In `app/admin/configuration/page.tsx`, remove this import:

```ts
import { listAccessibleCalendars } from "@/lib/google/calendar";
```

and remove this block:

```ts
  // Fetch data for the form (calendars, users)
  let calendars: { id: string; summary: string }[] = [];
  try {
    calendars = await listAccessibleCalendars();
  } catch (e) {
    console.error("Failed to list calendars:", e);
  }

```

and remove the `calendars={calendars}` prop from the `<ConfigurationTabs>` call at the bottom of the file. (Leave the `teamMembersMap` computation and prop in this file for now — Task 4 removes it once the admin UI that consumed it is gone.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: errors remaining only in `app/admin/configuration/ConfigurationTabs.tsx`, `InterviewsTab.tsx`, `InterviewConfigForm.tsx`, `CreateConfigModal.tsx`, `InitializeSystemButton.tsx` (still expecting a `calendars` prop / old config shape — fixed in Task 4), and in `components/InterviewScheduler.tsx`/`hooks/useInterviewData.ts` (fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add -A -- lib/google app/api/applications app/admin/configuration/page.tsx
git commit -m "feat: serve interview signup link instead of calendar slots"
```

---

### Task 4: Rework the admin config UI around a single link field

**Files:**
- Modify: `app/admin/configuration/InterviewConfigForm.tsx` (whole file)
- Modify: `app/admin/configuration/InterviewsTab.tsx`
- Modify: `app/admin/configuration/ConfigurationTabs.tsx`
- Modify: `app/admin/configuration/InitializeSystemButton.tsx`
- Modify: `app/admin/configuration/CreateConfigModal.tsx`
- Modify: `app/admin/configuration/page.tsx` (finish removing `teamMembersMap`)

**Interfaces:**
- Consumes: `InterviewSlotConfig` (Task 1), `createInterviewConfig`/`updateInterviewConfig` from `lib/actions/interview-config.ts` (unchanged — they already just spread whatever `InterviewSlotConfig` object they're given, so no edit needed to that file).
- Produces: `InterviewConfigForm({ config }: { config: InterviewSlotConfig })` — no more `calendars`/`availableUsers` props.

- [ ] **Step 1: Replace `app/admin/configuration/InterviewConfigForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { updateInterviewConfig } from "@/lib/actions/interview-config";
import { Link2, Save, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  config: InterviewSlotConfig;
}

export function InterviewConfigForm({ config }: Props) {
  const [formData, setFormData] = useState<InterviewSlotConfig>(config);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, signupLink: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (formData.signupLink && !/^https?:\/\//i.test(formData.signupLink)) {
      toast.error("Signup link must start with http:// or https://");
      return;
    }

    setIsSaving(true);
    try {
      await updateInterviewConfig(formData);
      toast.success("Configuration saved successfully");
      setHasChanges(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="p-5 flex justify-between items-center"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-1.5 h-8 rounded-full"
            style={{ backgroundColor: "var(--lhr-gold)" }}
          />
          <div>
            <h2 className="font-montserrat text-[17px] font-bold text-white">
              {config.team} — {config.system}
            </h2>
            <p className="font-urbanist text-[12px] text-white/25 mt-0.5">
              ID: {config.id}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200"
          style={{
            backgroundColor: hasChanges ? "var(--lhr-blue)" : "rgba(255,255,255,0.03)",
            color: hasChanges ? "white" : "rgba(255,255,255,0.2)",
            border: hasChanges ? "none" : "1px solid rgba(255,255,255,0.06)",
            cursor: hasChanges ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="p-6">
        <label
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase mb-2"
          style={{ color: "var(--lhr-gray-blue)" }}
        >
          <Link2 className="h-3.5 w-3.5" /> Signup Link
        </label>
        <input
          type="url"
          value={formData.signupLink}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="https://calendar.app.google/..."
          className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none transition-colors"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <p className="font-urbanist text-[11px] text-white/20 mt-2">
          Applicants who select this system will see this link once they reach the interview stage.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Drop `calendars`/`teamMembersMap` from `InterviewsTab.tsx`**

Change the props interface and destructuring from:

```tsx
interface InterviewsTabProps {
  configs: InterviewSlotConfig[];
  calendars: { id: string; summary: string }[];
  teamMembersMap: Record<string, User[]>;
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function InterviewsTab({
  configs,
  calendars,
  teamMembersMap,
  showCreateButton,
  leadSystemMissing,
  userData,
}: InterviewsTabProps) {
```

to:

```tsx
interface InterviewsTabProps {
  configs: InterviewSlotConfig[];
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function InterviewsTab({
  configs,
  showCreateButton,
  leadSystemMissing,
  userData,
}: InterviewsTabProps) {
```

and change the `InterviewConfigForm` usage from:

```tsx
          <InterviewConfigForm
            key={config.id}
            config={config}
            calendars={calendars}
            availableUsers={teamMembersMap[config.team] || []}
          />
```

to:

```tsx
          <InterviewConfigForm
            key={config.id}
            config={config}
          />
```

`User` remains imported/used elsewhere in this file (`userData: User`), so leave that import alone.

- [ ] **Step 3: Drop `calendars`/`teamMembersMap` from `ConfigurationTabs.tsx`**

Change the props interface/destructuring from:

```tsx
interface ConfigurationTabsProps {
  configs: InterviewSlotConfig[];
  calendars: { id: string; summary: string }[];
  teamMembersMap: Record<string, User[]>;
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function ConfigurationTabs({
  configs,
  calendars,
  teamMembersMap,
  showCreateButton,
  leadSystemMissing,
  userData,
}: ConfigurationTabsProps) {
```

to:

```tsx
interface ConfigurationTabsProps {
  configs: InterviewSlotConfig[];
  showCreateButton: boolean;
  leadSystemMissing: boolean;
  userData: User;
}

export function ConfigurationTabs({
  configs,
  showCreateButton,
  leadSystemMissing,
  userData,
}: ConfigurationTabsProps) {
```

and change the `<InterviewsTab>` usage from:

```tsx
            <InterviewsTab
              configs={configs}
              calendars={calendars}
              teamMembersMap={teamMembersMap}
              showCreateButton={showCreateButton}
              leadSystemMissing={leadSystemMissing}
              userData={userData}
            />
```

to:

```tsx
            <InterviewsTab
              configs={configs}
              showCreateButton={showCreateButton}
              leadSystemMissing={leadSystemMissing}
              userData={userData}
            />
```

- [ ] **Step 4: Update the blank-config object in `InitializeSystemButton.tsx`**

Replace:

```ts
      const newConfig: InterviewSlotConfig = {
        id: "",
        team,
        system,
        calendarId: "",
        interviewerEmails: [],
        durationMinutes: 30,
        bufferMinutes: 10,
        availableDays: [1, 2, 3, 4, 5],
        availableStartHour: 9,
        availableEndHour: 17,
        timezone: "America/Chicago"
      };
```

with:

```ts
      const newConfig: InterviewSlotConfig = {
        id: "",
        team,
        system,
        signupLink: "",
      };
```

- [ ] **Step 5: Update the blank-config object in `CreateConfigModal.tsx`**

Replace:

```ts
      const newConfig: InterviewSlotConfig = {
        id: "",
        team: selectedTeam as Team,
        system: selectedSystem,
        calendarId: "",
        interviewerEmails: [],
        durationMinutes: 30,
        bufferMinutes: 10,
        availableDays: [1, 2, 3, 4, 5],
        availableStartHour: 9,
        availableEndHour: 17,
        timezone: "America/Chicago"
      };
```

with:

```ts
      const newConfig: InterviewSlotConfig = {
        id: "",
        team: selectedTeam as Team,
        system: selectedSystem,
        signupLink: "",
      };
```

- [ ] **Step 6: Remove `teamMembersMap` from `app/admin/configuration/page.tsx`**

Remove this import:

```ts
import { getTeamMembers } from "@/lib/actions/users";
```

Remove this block:

```ts
  // Fetch members for relevant teams
  const relevantTeams = new Set<string>();
  if (userData.memberProfile?.team) {
    relevantTeams.add(userData.memberProfile.team);
  }
  // Also add teams from existing configs (for admins who might see many)
  configs.forEach(c => relevantTeams.add(c.team));

  const teamMembersMap: Record<string, User[]> = {};
  for (const team of relevantTeams) {
    // @ts-ignore
    teamMembersMap[team] = await getTeamMembers(team);
  }

```

Remove the `teamMembersMap={teamMembersMap}` prop from the `<ConfigurationTabs>` call.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: no more errors in `app/admin/configuration/*`. Remaining errors should be confined to `components/InterviewScheduler.tsx` and `hooks/useInterviewData.ts` (Task 5).

- [ ] **Step 8: Manual check**

Run: `npm run dev`, sign in as an admin, open `/admin/configuration`, click the Interviews tab. Confirm each config card shows a single "Signup Link" input, typing a URL enables "Save Changes", and saving shows the success toast. Try saving a non-URL string (e.g. `not a link`) and confirm the validation toast appears and nothing is saved.

- [ ] **Step 9: Commit**

```bash
git add app/admin/configuration
git commit -m "feat: replace interview calendar config with signup link field"
```

---

### Task 5: Rewrite the applicant-facing scheduler around the signup link

**Files:**
- Modify: `hooks/useInterviewData.ts` (whole file)
- Modify: `components/InterviewScheduler.tsx` (whole file)

**Interfaces:**
- Consumes: `GET /api/applications/[id]/interview` response shape from Task 3.
- Produces: `useInterviewData(applicationId)` returning `{ interviewData: InterviewDataResponse | null, isLoading, error, mutate }` where `InterviewDataResponse.offers[]` carry `signupLink?`/`configMissing?` instead of `availableSlots`.

- [ ] **Step 1: Replace `hooks/useInterviewData.ts`**

```ts
import useSWR from "swr";
import { InterviewEventStatus } from "@/lib/models/Application";

interface InterviewOfferWithSlots {
  system: string;
  status: InterviewEventStatus;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  signupLink?: string;
  configMissing?: boolean;
  error?: string;
}

interface InterviewDataResponse {
  team: string;
  offers: InterviewOfferWithSlots[];
  selectedSystem?: string;
  needsSystemSelection: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (res.status === 401) {
    // Session mismatch - log out the user
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    }
    window.location.href = "/auth/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to load interview data");
  }
  return res.json();
};

/**
 * Hook to fetch interview scheduling data for an application.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useInterviewData(applicationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<InterviewDataResponse>(
    applicationId ? `/api/applications/${applicationId}/interview` : null,
    fetcher
  );

  return {
    interviewData: data ?? null,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export type { InterviewOfferWithSlots, InterviewDataResponse };
```

- [ ] **Step 2: Replace `components/InterviewScheduler.tsx`**

```tsx
"use client";

import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { useInterviewData } from "@/hooks/useInterviewData";
import { toast } from "react-hot-toast";

interface InterviewSchedulerProps {
  application: Application;
  onScheduled?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  [InterviewEventStatus.PENDING]: {
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.15)",
    color: "#facc15",
    label: "Awaiting Signup",
  },
  [InterviewEventStatus.CANCELLED]: {
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.15)",
    color: "#f87171",
    label: "Cancelled",
  },
  [InterviewEventStatus.COMPLETED]: {
    bg: "rgba(4,95,133,0.12)",
    border: "rgba(4,95,133,0.25)",
    color: "#38bdf8",
    label: "Completed",
  },
  [InterviewEventStatus.NO_SHOW]: {
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.4)",
    label: "No Show",
  },
};

export default function InterviewScheduler({
  application,
}: InterviewSchedulerProps) {
  const { interviewData, isLoading: loading, error, mutate } = useInterviewData(application.id);

  // Select system for Combustion/Electric
  const selectSystem = async (system: string) => {
    try {
      const res = await fetch(`/api/applications/${application.id}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to select system");
      }

      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to select system");
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const displayError = error instanceof Error ? error.message : error;

  // Status badge
  const getStatusBadge = (status: InterviewEventStatus) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES[InterviewEventStatus.PENDING];

    return (
      <span
        className="px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-md"
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          color: style.color,
        }}
      >
        {style.label}
      </span>
    );
  };

  if (loading && !interviewData) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6 p-7"
        style={{ backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}
      >
        <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>{displayError}</p>
        <button
          onClick={() => mutate()}
          className="mt-3 text-[13px] font-medium transition-colors duration-200"
          style={{ color: 'var(--lhr-blue-light)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!interviewData || interviewData.offers.length === 0) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="p-7">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
            >
              <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Interview Stage</h3>
          </div>
          <p className="font-urbanist text-[14px] text-white/40 leading-relaxed">
            Congratulations! Your application is being reviewed for interviews.
            Check back soon for available interview slots.
          </p>
        </div>
      </div>
    );
  }

  // System selection UI for Combustion/Electric
  if (interviewData.needsSystemSelection) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(6,182,212,0.03)', border: '1px solid rgba(6,182,212,0.12)' }}
      >
        <div className="p-7">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
            >
              <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Select Your Interview System</h3>
          </div>
          <p className="font-urbanist text-[14px] text-white/40 mb-6 leading-relaxed">
            Multiple systems are interested in interviewing you! For{" "}
            {application.team}, you can choose <strong className="text-white/60">one system</strong> to
            interview with.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {interviewData.offers.map((offer) => (
              <button
                key={offer.system}
                onClick={() => selectSystem(offer.system)}
                disabled={loading}
                className="group p-4 rounded-lg text-left transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(6,182,212,0.3)';
                  e.currentTarget.style.backgroundColor = 'rgba(6,182,212,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                }}
              >
                <h4 className="text-[14px] font-semibold text-white mb-1">
                  {offer.system}
                </h4>
                <p className="font-urbanist text-[12px] text-white/30">
                  Click to select this system
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden mb-6"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="px-7 pt-6 pb-2 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
        >
          <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">
          Schedule Your Interview{application.team === Team.SOLAR ? "s" : ""}
        </h3>
      </div>

      <div className="px-7 pb-7 space-y-4 mt-4">
        {interviewData.offers.map((offer) => {
          // For Combustion/Electric, only show the selected system
          if (
            application.team !== Team.SOLAR &&
            interviewData.selectedSystem &&
            offer.system !== interviewData.selectedSystem
          ) {
            return null;
          }

          return (
            <div
              key={offer.system}
              className="rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[14px] font-semibold text-white">{offer.system}</h4>
                  {getStatusBadge(offer.status)}
                </div>

                {offer.status === InterviewEventStatus.PENDING && offer.signupLink && (
                  <div className="space-y-3">
                    <div
                      className="p-4 rounded-lg flex items-start gap-2.5"
                      style={{ backgroundColor: 'rgba(255,181,38,0.06)', border: '1px solid rgba(255,181,38,0.15)' }}
                    >
                      <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'rgba(255,181,38,0.8)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: 'rgba(255,181,38,0.85)' }}>
                        Do not distribute this link. It is for your use only — sharing it could let someone else book your interview slot.
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-lg"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <p className="font-urbanist text-[12px] text-white/30 mb-2">Your signup link</p>
                      <p className="text-[13px] text-white/70 break-all mb-4">{offer.signupLink}</p>
                      <div className="flex items-center gap-2">
                        <a
                          href={offer.signupLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
                          style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
                        >
                          Open signup form
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-8.25 8.25M6 10.5v7.5A1.5 1.5 0 007.5 19.5H15" />
                          </svg>
                        </a>
                        <button
                          onClick={() => copyLink(offer.signupLink!)}
                          className="h-9 px-4 rounded-lg text-[13px] font-medium transition-all duration-200"
                          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                        >
                          Copy link
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {offer.status === InterviewEventStatus.PENDING && offer.configMissing && (
                  <p className="font-urbanist text-[14px] text-white/40">
                    Your signup link isn&apos;t available yet. Please check back later.
                  </p>
                )}

                {offer.status === InterviewEventStatus.PENDING && offer.error && (
                  <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>{offer.error}</p>
                )}

                {offer.status === InterviewEventStatus.CANCELLED && (
                  <div
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
                  >
                    <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>
                      This interview was cancelled.
                      {offer.cancelReason && ` Reason: ${offer.cancelReason}`}
                    </p>
                  </div>
                )}

                {offer.status === InterviewEventStatus.COMPLETED && (
                  <p className="font-urbanist text-[14px] text-white/40">Your interview has been marked complete.</p>
                )}

                {offer.status === InterviewEventStatus.NO_SHOW && (
                  <p className="font-urbanist text-[14px] text-white/40">This interview was marked as a no-show.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note this drops the `onScheduled` callback usage (no more in-app booking action to notify about) — the prop stays declared on `InterviewSchedulerProps` for call-site compatibility but is intentionally unused in the body; confirm in Step 4 below whether `app/dashboard/applications/[id]/page.tsx` still passes `onScheduled` and whether that's fine to leave as a no-op.

- [ ] **Step 3: Check the `onScheduled` call site**

Run: `grep -n "onScheduled" app/dashboard/applications/[id]/page.tsx`

If it passes an `onScheduled` handler (e.g. to re-fetch the application), leave that prop wired — it's harmless dead code from the component's side (never called), but removing it from the parent isn't necessary for this feature and isn't worth a scope-creeping edit. If `npm run build` (next step) flags the unused prop, remove `onScheduled?: () => void;` from `InterviewSchedulerProps` and the corresponding prop pass in the parent instead of leaving an unused parameter.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exits 0, no type errors anywhere in the project.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. As a test applicant in interview stage with a PENDING offer and a signup link configured (set one via the admin UI from Task 4 first), open `/dashboard/applications/[id]` and confirm:
- The "Do not distribute" banner and link card render for the active offer.
- "Open signup form" opens the link in a new tab.
- "Copy link" copies it and shows a toast.
- For a system with no link configured yet, the "isn't available yet" message shows instead.
- For Electric/Combustion with >1 offer, the system-selection screen still appears first, and picking a system leaves only that system's card visible afterward.

- [ ] **Step 6: Commit**

```bash
git add hooks/useInterviewData.ts components/InterviewScheduler.tsx
git commit -m "feat: show interview signup link in applicant scheduler"
```

---

### Task 6: Update docs and do a final full verification

**Files:**
- Modify: `CLAUDE.md` (Stack section)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Update the stack line**

In `CLAUDE.md`, under `## Stack`, change:

```
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Firebase
(client SDK for Google auth, Admin SDK for all data access) · SWR · AWS SES (email) ·
Google Calendar API (interview scheduling).
```

to:

```
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Firebase
(client SDK for Google auth, Admin SDK for all data access) · SWR · AWS SES (email).
Interview scheduling is a system-lead-managed external signup link, not an in-app
calendar integration.
```

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Grep sweep for stragglers**

Run: `grep -rn "calendarId\|availableSlots\|InterviewEventStatus.SCHEDUL\|lib/google/calendar" app lib components hooks --include="*.ts" --include="*.tsx"`
Expected: no output (everything referencing the deleted calendar-booking fields/module is gone).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update stack notes for interview signup-link change"
```

---
