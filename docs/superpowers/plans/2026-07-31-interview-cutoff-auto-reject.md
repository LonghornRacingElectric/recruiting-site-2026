# Interview Cutoff Auto-Reject Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old "auto-reject unselected system on advance-to-trial" sweep with a new recruiting-cycle step (`CLOSE_INTERVIEWS`) that, when an admin sets it, auto-rejects any applicant (any team) who never scheduled an interview slot.

**Architecture:** A new `RecruitingStep` enum value is inserted into the existing step-order cycle. A new sweep function queries all `INTERVIEW`-status applications globally and rejects any whose interview offers never reached `SCHEDULED`/`COMPLETED`, reusing the existing `rejectApplicationFromSystems` rejection path. The sweep is triggered from inside the existing "update recruiting step" admin endpoint when the new step is selected — no new UI.

**Tech Stack:** Next.js 16 App Router API routes, Firebase Admin SDK (Firestore), TypeScript. No test runner is configured in this repo — verification is done via `npx tsc --noEmit` for type safety and disposable `tsx` scripts run against the real Firestore project (`lhr-recruiting-2026`) using the app's existing `isFakeData`-flagged test-data convention (see `app/api/admin/applications/seed/route.ts`), never against real applicant data.

## Global Constraints

- No team exemption for this sweep — applies to Electric, Combustion, and Solar alike (unlike the old sweep it replaces).
- "Scheduled" means an interview offer's `status` is `InterviewEventStatus.SCHEDULED` or `InterviewEventStatus.COMPLETED`. `PENDING`, `SCHEDULING`, `CANCELLED`, and `NO_SHOW` all count as "not scheduled."
- Applications with zero interview offers are skipped by the sweep, not rejected.
- The sweep must reuse `rejectApplicationFromSystems` — do not duplicate its status/decision-field update logic.
- Never flip the real production `config/recruiting.currentStep` document as part of automated verification — it's a live singleton read by every visitor. Task 4's verification is static (grep + typecheck) only; flipping the real step is a manual QA step for the user to run deliberately.
- Any disposable verification script must be deleted after it's run — do not leave scratch files in the repo.

---

### Task 1: Add CLOSE_INTERVIEWS step to the recruiting cycle

**Files:**
- Modify: `lib/models/Config.ts:1-11` (the `RecruitingStep` enum)
- Modify: `lib/utils/statusUtils.ts:5-15` (the `STEP_ORDER` array)
- Modify: `app/admin/settings/page.tsx:9-19` (the `STEP_DESCRIPTIONS` record)
- Test: throwaway `scratch-verify-step-order.mts` at repo root (deleted after use)

**Interfaces:**
- Consumes: existing `RecruitingStep` enum, existing `STEP_ORDER` array and `isAtOrPast()` in `lib/utils/statusUtils.ts`, existing `STEP_DESCRIPTIONS: Record<RecruitingStep, string>` in `app/admin/settings/page.tsx`.
- Produces: `RecruitingStep.CLOSE_INTERVIEWS` (value `"close_interviews"`), correctly ordered between `INTERVIEWING` and `RELEASE_TRIAL` in both `STEP_ORDER` and the enum declaration itself. Later tasks (3, 4) reference `RecruitingStep.CLOSE_INTERVIEWS` by this exact name.

- [ ] **Step 1: Write the failing verification script**

Create `scratch-verify-step-order.mts` at the repo root:

```ts
import { RecruitingStep } from "./lib/models/Config";
import { isAtOrPast } from "./lib/utils/statusUtils";

const checks: [boolean, string][] = [
  [isAtOrPast(RecruitingStep.CLOSE_INTERVIEWS, RecruitingStep.INTERVIEWING) === true, "CLOSE_INTERVIEWS should be at-or-past INTERVIEWING"],
  [isAtOrPast(RecruitingStep.CLOSE_INTERVIEWS, RecruitingStep.RELEASE_TRIAL) === false, "CLOSE_INTERVIEWS should NOT be at-or-past RELEASE_TRIAL"],
  [isAtOrPast(RecruitingStep.RELEASE_TRIAL, RecruitingStep.CLOSE_INTERVIEWS) === true, "RELEASE_TRIAL should be at-or-past CLOSE_INTERVIEWS"],
  [isAtOrPast(RecruitingStep.CLOSE_INTERVIEWS, RecruitingStep.CLOSE_INTERVIEWS) === true, "CLOSE_INTERVIEWS should be at-or-past itself"],
];

const failures = checks.filter(([passed]) => !passed);
if (failures.length > 0) {
  console.error("FAIL:", failures.map(([, msg]) => msg));
  process.exit(1);
}
console.log("PASS: step order checks");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL with `Property 'CLOSE_INTERVIEWS' does not exist on type 'typeof RecruitingStep'` (multiple times, once per reference in the script)

- [ ] **Step 3: Add the enum value**

In `lib/models/Config.ts`, current content is:

```ts
export enum RecruitingStep {
  OPEN = "open",
  REVIEWING = "reviewing",
  RELEASE_INTERVIEWS = "release_interviews",
  INTERVIEWING = "interviewing",
  RELEASE_TRIAL = "release_trial",
  TRIAL_WORKDAY = "trial_workday",
  RELEASE_DECISIONS_DAY1 = "release_decisions_day1",
  RELEASE_DECISIONS_DAY2 = "release_decisions_day2",
  RELEASE_DECISIONS_DAY3 = "release_decisions_day3",
}
```

Change it to insert `CLOSE_INTERVIEWS` between `INTERVIEWING` and `RELEASE_TRIAL`:

```ts
export enum RecruitingStep {
  OPEN = "open",
  REVIEWING = "reviewing",
  RELEASE_INTERVIEWS = "release_interviews",
  INTERVIEWING = "interviewing",
  CLOSE_INTERVIEWS = "close_interviews",
  RELEASE_TRIAL = "release_trial",
  TRIAL_WORKDAY = "trial_workday",
  RELEASE_DECISIONS_DAY1 = "release_decisions_day1",
  RELEASE_DECISIONS_DAY2 = "release_decisions_day2",
  RELEASE_DECISIONS_DAY3 = "release_decisions_day3",
}
```

- [ ] **Step 4: Add it to STEP_ORDER**

In `lib/utils/statusUtils.ts`, current content is:

```ts
const STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS_DAY1,
  RecruitingStep.RELEASE_DECISIONS_DAY2,
  RecruitingStep.RELEASE_DECISIONS_DAY3,
];
```

Change it to:

```ts
const STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.CLOSE_INTERVIEWS,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS_DAY1,
  RecruitingStep.RELEASE_DECISIONS_DAY2,
  RecruitingStep.RELEASE_DECISIONS_DAY3,
];
```

- [ ] **Step 5: Add the STEP_DESCRIPTIONS entry**

In `app/admin/settings/page.tsx`, current content is:

```ts
const STEP_DESCRIPTIONS: Record<RecruitingStep, string> = {
  [RecruitingStep.OPEN]: "Applications are open. Applicants see 'In Progress' or 'Submitted'.",
  [RecruitingStep.REVIEWING]: "Applications effectively closed. All statuses masked as 'Submitted'.",
  [RecruitingStep.RELEASE_INTERVIEWS]: "Applicants can see Interview invites. Rejections masked as 'Submitted'.",
  [RecruitingStep.INTERVIEWING]: "Interviews in progress. Rejections still masked.",
  [RecruitingStep.RELEASE_TRIAL]: "Applicants can see Trial invites. Rejections masked.",
  [RecruitingStep.TRIAL_WORKDAY]: "Trials in progress.",
  [RecruitingStep.RELEASE_DECISIONS_DAY1]: "Day 1: Early acceptances, rejections, and waitlist are visible.",
  [RecruitingStep.RELEASE_DECISIONS_DAY2]: "Day 2: Waitlist updates visible. Some waitlisted applicants may be accepted.",
  [RecruitingStep.RELEASE_DECISIONS_DAY3]: "Day 3: Final decisions. All accepts, rejects, and waitlist resolutions visible.",
};
```

Change it to insert a `CLOSE_INTERVIEWS` entry between `INTERVIEWING` and `RELEASE_TRIAL`:

```ts
const STEP_DESCRIPTIONS: Record<RecruitingStep, string> = {
  [RecruitingStep.OPEN]: "Applications are open. Applicants see 'In Progress' or 'Submitted'.",
  [RecruitingStep.REVIEWING]: "Applications effectively closed. All statuses masked as 'Submitted'.",
  [RecruitingStep.RELEASE_INTERVIEWS]: "Applicants can see Interview invites. Rejections masked as 'Submitted'.",
  [RecruitingStep.INTERVIEWING]: "Interviews in progress. Rejections still masked.",
  [RecruitingStep.CLOSE_INTERVIEWS]: "Interview scheduling window closed. Applicants who never booked a slot are auto-rejected.",
  [RecruitingStep.RELEASE_TRIAL]: "Applicants can see Trial invites. Rejections masked.",
  [RecruitingStep.TRIAL_WORKDAY]: "Trials in progress.",
  [RecruitingStep.RELEASE_DECISIONS_DAY1]: "Day 1: Early acceptances, rejections, and waitlist are visible.",
  [RecruitingStep.RELEASE_DECISIONS_DAY2]: "Day 2: Waitlist updates visible. Some waitlisted applicants may be accepted.",
  [RecruitingStep.RELEASE_DECISIONS_DAY3]: "Day 3: Final decisions. All accepts, rejects, and waitlist resolutions visible.",
};
```

- [ ] **Step 6: Run the verification script and typecheck to confirm they pass**

Run: `npx tsc --noEmit && npx tsx scratch-verify-step-order.mts`
Expected: typecheck produces no output (success), then `PASS: step order checks`

- [ ] **Step 7: Delete the scratch script**

Run: `rm scratch-verify-step-order.mts`

- [ ] **Step 8: Commit**

```bash
git add lib/models/Config.ts lib/utils/statusUtils.ts app/admin/settings/page.tsx
git commit -m "feat: add CLOSE_INTERVIEWS step to recruiting cycle"
```

---

### Task 2: Remove the old advance-to-trial system-selection sweep

**Files:**
- Modify: `lib/firebase/applications.ts:1181-1220` (delete `autoRejectUnselectedInterviewApplicants` and its doc comment)
- Modify: `app/api/admin/applications/[id]/status/route.ts:3, 216-222`
- Modify: `app/api/admin/applications/bulk-status/route.ts:3, 122-128`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a codebase with zero references to `autoRejectUnselectedInterviewApplicants`. Task 4 must not reintroduce it.

- [ ] **Step 1: Confirm current reference count**

Run: `grep -rn "autoRejectUnselectedInterviewApplicants" --include="*.ts" . | grep -v node_modules`
Expected: 4 matches (1 definition in `lib/firebase/applications.ts`, 1 import + 1 call site in each of the two route files)

- [ ] **Step 2: Delete the function from lib/firebase/applications.ts**

Current content at lines 1181-1220:

```ts
/**
 * Auto-reject applicants who received multiple interview offers within the same
 * team (Electric/Combustion) and never selected which system to interview for.
 * Solar is exempt since it never requires system selection.
 *
 * Intended to run whenever any application in the team advances past the
 * interview stage, so unresolved selections don't linger indefinitely.
 */
export async function autoRejectUnselectedInterviewApplicants(
  team: Team,
  excludeApplicationId?: string
): Promise<string[]> {
  if (team === Team.SOLAR) {
    return [];
  }

  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("team", "==", team)
    .where("status", "==", ApplicationStatus.INTERVIEW)
    .get();

  const rejectedIds: string[] = [];

  for (const doc of snapshot.docs) {
    if (doc.id === excludeApplicationId) continue;

    const data = doc.data();
    const offers = normalizeInterviewOffers(data.interviewOffers) || [];
    const selectedSystem = data.selectedInterviewSystem;

    const needsSystemSelection = offers.length > 1 && !selectedSystem;
    if (!needsSystemSelection) continue;

    await rejectApplicationFromSystems(doc.id, offers.map((o) => o.system));
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}
```

Delete this entire block (including the doc comment), leaving the surrounding `rejectApplicationFromSystems` function and `respondToCommitment` function directly adjacent with a single blank line between them.

- [ ] **Step 3: Remove the import and call site in the single-application status route**

In `app/api/admin/applications/[id]/status/route.ts`, current import line 3:

```ts
import { updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, autoRejectUnselectedInterviewApplicants, getApplication } from "@/lib/firebase/applications";
```

Change to:

```ts
import { updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, getApplication } from "@/lib/firebase/applications";
```

Current content at lines 212-222:

```ts
      // Atomically create trial offers and un-reject systems in a single transaction
      // Also set interviewDecision since we're advancing from interview to trial
      updatedApp = await addMultipleTrialOffers(id, systemsToOffer, 'advanced');

      // Auto-reject other interview-stage applicants in this team who never
      // selected which system to interview for.
      try {
        await autoRejectUnselectedInterviewApplicants(application.team, id);
      } catch (err) {
        logger.error({ err, team: application.team }, "Failed to sweep unselected interview applicants");
      }
    } else {
```

Change to:

```ts
      // Atomically create trial offers and un-reject systems in a single transaction
      // Also set interviewDecision since we're advancing from interview to trial
      updatedApp = await addMultipleTrialOffers(id, systemsToOffer, 'advanced');
    } else {
```

- [ ] **Step 4: Remove the import and call site in the bulk-status route**

In `app/api/admin/applications/bulk-status/route.ts`, current import line 3:

```ts
import { getApplication, updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, autoRejectUnselectedInterviewApplicants, rejectApplicationFromSystems } from "@/lib/firebase/applications";
```

Change to:

```ts
import { getApplication, updateApplication, addMultipleInterviewOffers, addMultipleTrialOffers, rejectApplicationFromSystems } from "@/lib/firebase/applications";
```

Current content at lines 119-131:

```ts
            case "trial": {
              await addMultipleTrialOffers(appId, effectiveSystems, 'advanced');

              // Auto-reject other interview-stage applicants in this team who
              // never selected which system to interview for.
              try {
                await autoRejectUnselectedInterviewApplicants(application.team, appId);
              } catch (err) {
                logger.error({ err, team: application.team }, "Failed to sweep unselected interview applicants");
              }

              return { id: appId, success: true };
            }
```

Change to:

```ts
            case "trial": {
              await addMultipleTrialOffers(appId, effectiveSystems, 'advanced');
              return { id: appId, success: true };
            }
```

- [ ] **Step 5: Verify no references remain and typecheck passes**

Run: `grep -rn "autoRejectUnselectedInterviewApplicants" --include="*.ts" . | grep -v node_modules; npx tsc --noEmit`
Expected: grep produces no output, typecheck produces no output (success)

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/applications.ts "app/api/admin/applications/[id]/status/route.ts" app/api/admin/applications/bulk-status/route.ts
git commit -m "refactor: remove advance-to-trial system-selection sweep"
```

---

### Task 3: Add the new schedule-based auto-reject sweep function

**Files:**
- Modify: `lib/firebase/applications.ts` (add the new function; insert it where the old one used to be, just before `respondToCommitment`)
- Test: throwaway `scratch-verify-schedule-sweep.mts` at repo root (deleted after use)

**Interfaces:**
- Consumes: existing `adminDb`, `APPLICATIONS_COLLECTION`, `ApplicationStatus`, `InterviewEventStatus`, `normalizeInterviewOffers`, `rejectApplicationFromSystems` — all already defined in `lib/firebase/applications.ts`.
- Produces: `autoRejectUnscheduledInterviewApplicants(): Promise<string[]>`, exported from `lib/firebase/applications.ts`. Task 4 imports and calls this by exact name with no arguments.

- [ ] **Step 1: Write the failing verification script**

Create `scratch-verify-schedule-sweep.mts` at the repo root:

```ts
import { config } from "dotenv";
config({ path: ".env" });

const { adminDb } = await import("./lib/firebase/admin");
const { autoRejectUnscheduledInterviewApplicants } = await import("./lib/firebase/applications");
const { ApplicationStatus, InterviewEventStatus } = await import("./lib/models/Application");
const { Team } = await import("./lib/models/User");

const APPLICATIONS_COLLECTION = "applications";
const USERS_COLLECTION = "users";

function fakeUser(name: string) {
  return {
    uid: `fake_sweep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    email: `${name.toLowerCase()}.sweep@utexas.edu`,
    role: "applicant",
    blacklisted: false,
    applications: [] as string[],
    phoneNumber: null,
    isMember: false,
    isFakeData: true,
  };
}

async function createFakeApplication(overrides: Record<string, unknown>) {
  const user = fakeUser(overrides.userName as string);
  const userRef = adminDb.collection(USERS_COLLECTION).doc(user.uid);
  const appRef = adminDb.collection(APPLICATIONS_COLLECTION).doc();

  const base = {
    userId: user.uid,
    userName: user.name,
    userEmail: user.email,
    team: Team.ELECTRIC,
    preferredSystems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    formData: {},
    isFakeData: true,
  };

  await userRef.set({ ...user, applications: [appRef.id] });
  await appRef.set({ ...base, ...overrides, id: appRef.id });

  return { userId: user.uid, appId: appRef.id };
}

async function cleanup(ids: { userId: string; appId: string }[]) {
  const batch = adminDb.batch();
  for (const { userId, appId } of ids) {
    batch.delete(adminDb.collection(USERS_COLLECTION).doc(userId));
    batch.delete(adminDb.collection(APPLICATIONS_COLLECTION).doc(appId));
  }
  await batch.commit();
}

async function main() {
  console.log("Creating fake applications...");

  // A: only unscheduled (PENDING) offers -> should be rejected
  const a = await createFakeApplication({
    userName: "SweepAlice",
    team: Team.ELECTRIC,
    status: ApplicationStatus.INTERVIEW,
    interviewOffers: [
      { system: "Electronics", status: InterviewEventStatus.PENDING, createdAt: new Date() },
    ],
  });

  // B: one scheduled offer among two -> should NOT be rejected
  const b = await createFakeApplication({
    userName: "SweepBob",
    team: Team.ELECTRIC,
    status: ApplicationStatus.INTERVIEW,
    interviewOffers: [
      { system: "Electronics", status: InterviewEventStatus.SCHEDULED, createdAt: new Date() },
      { system: "Controls", status: InterviewEventStatus.PENDING, createdAt: new Date() },
    ],
  });

  // C: single cancelled offer, nothing else -> should be rejected
  const c = await createFakeApplication({
    userName: "SweepCarol",
    team: Team.ELECTRIC,
    status: ApplicationStatus.INTERVIEW,
    interviewOffers: [
      { system: "Electronics", status: InterviewEventStatus.CANCELLED, createdAt: new Date() },
    ],
  });

  // D: Solar applicant, unscheduled -> should be rejected (no team exemption)
  const d = await createFakeApplication({
    userName: "SweepDave",
    team: Team.SOLAR,
    status: ApplicationStatus.INTERVIEW,
    interviewOffers: [
      { system: "Aero", status: InterviewEventStatus.PENDING, createdAt: new Date() },
    ],
  });

  // E: zero interview offers -> should be skipped, not rejected
  const e = await createFakeApplication({
    userName: "SweepEve",
    team: Team.ELECTRIC,
    status: ApplicationStatus.INTERVIEW,
    interviewOffers: [],
  });

  const allIds = [a, b, c, d, e];

  try {
    console.log("Running sweep...");
    const rejected = await autoRejectUnscheduledInterviewApplicants();
    console.log("Sweep rejected IDs:", rejected);

    const [aDoc, bDoc, cDoc, dDoc, eDoc] = await Promise.all(
      [a, b, c, d, e].map(({ appId }) => adminDb.collection(APPLICATIONS_COLLECTION).doc(appId).get())
    );

    const results = {
      A_unscheduled_should_be_REJECTED: aDoc.data()?.status,
      B_one_scheduled_should_stay_INTERVIEW: bDoc.data()?.status,
      C_cancelled_only_should_be_REJECTED: cDoc.data()?.status,
      D_solar_unscheduled_should_be_REJECTED: dDoc.data()?.status,
      E_zero_offers_should_stay_INTERVIEW: eDoc.data()?.status,
    };

    console.log("Results:", results);

    const pass =
      results.A_unscheduled_should_be_REJECTED === ApplicationStatus.REJECTED &&
      results.B_one_scheduled_should_stay_INTERVIEW === ApplicationStatus.INTERVIEW &&
      results.C_cancelled_only_should_be_REJECTED === ApplicationStatus.REJECTED &&
      results.D_solar_unscheduled_should_be_REJECTED === ApplicationStatus.REJECTED &&
      results.E_zero_offers_should_stay_INTERVIEW === ApplicationStatus.INTERVIEW;

    console.log(pass ? "PASS" : "FAIL");
    if (!pass) process.exitCode = 1;
  } finally {
    console.log("Cleaning up fake data...");
    await cleanup(allIds);
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scratch-verify-schedule-sweep.mts`
Expected: FAIL at the dynamic import — `autoRejectUnscheduledInterviewApplicants` is not exported from `./lib/firebase/applications` yet

- [ ] **Step 3: Implement the sweep function**

In `lib/firebase/applications.ts`, insert this new function where the old `autoRejectUnselectedInterviewApplicants` used to be (just before `respondToCommitment`):

```ts
/**
 * Auto-reject applicants whose interview offers never reached SCHEDULED or
 * COMPLETED. Applies across all teams (no Solar exemption, unlike the old
 * system-selection sweep this replaces) since booking a slot is required
 * regardless of team.
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

- [ ] **Step 4: Run the verification script and typecheck to confirm they pass**

Run: `npx tsc --noEmit && npx tsx scratch-verify-schedule-sweep.mts`
Expected: typecheck produces no output (success), then all 5 results print as expected and `PASS`

- [ ] **Step 5: Delete the scratch script**

Run: `rm scratch-verify-schedule-sweep.mts`

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/applications.ts
git commit -m "feat: add auto-reject sweep for unscheduled interview applicants"
```

---

### Task 4: Wire the sweep into the recruiting-step admin endpoint

**Files:**
- Modify: `app/api/admin/config/recruiting/route.ts`

**Interfaces:**
- Consumes: `RecruitingStep.CLOSE_INTERVIEWS` (Task 1), `autoRejectUnscheduledInterviewApplicants()` (Task 3), existing `updateRecruitingStep(step, uid)` from `lib/firebase/config.ts`.
- Produces: the fully wired feature — no further tasks depend on this one.

- [ ] **Step 1: Confirm current file content**

Current `POST` handler body in `app/api/admin/config/recruiting/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/auth/guard";
import { getRecruitingConfig, updateRecruitingStep } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { appCache } from "@/lib/utils/appCache";
import pino from "pino";

const logger = pino();

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireAdmin();
    
    const body = await request.json();
    const { step } = body;

    if (!Object.values(RecruitingStep).includes(step)) {
        return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    await updateRecruitingStep(step, uid);
    
    // Update cache
    appCache.setRecruitingStep(step);
    // Invalidate applications because their computed status/ratings depend on the step
    appCache.invalidateApplications();

    return NextResponse.json({ success: true, step });
  } catch (error) {
```

- [ ] **Step 2: Add the import**

Change:

```ts
import { getRecruitingConfig, updateRecruitingStep } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { appCache } from "@/lib/utils/appCache";
```

To:

```ts
import { getRecruitingConfig, updateRecruitingStep } from "@/lib/firebase/config";
import { RecruitingStep } from "@/lib/models/Config";
import { autoRejectUnscheduledInterviewApplicants } from "@/lib/firebase/applications";
import { appCache } from "@/lib/utils/appCache";
```

- [ ] **Step 3: Call the sweep after updating the step**

Change:

```ts
    await updateRecruitingStep(step, uid);
    
    // Update cache
    appCache.setRecruitingStep(step);
    // Invalidate applications because their computed status/ratings depend on the step
    appCache.invalidateApplications();

    return NextResponse.json({ success: true, step });
```

To:

```ts
    await updateRecruitingStep(step, uid);

    // Interview scheduling window has closed - reject applicants who never
    // booked a slot.
    if (step === RecruitingStep.CLOSE_INTERVIEWS) {
      try {
        await autoRejectUnscheduledInterviewApplicants();
      } catch (err) {
        logger.error({ err }, "Failed to sweep unscheduled interview applicants");
      }
    }

    // Update cache
    appCache.setRecruitingStep(step);
    // Invalidate applications because their computed status/ratings depend on the step
    appCache.invalidateApplications();

    return NextResponse.json({ success: true, step });
```

- [ ] **Step 4: Verify wiring statically**

Run: `grep -n "autoRejectUnscheduledInterviewApplicants\|CLOSE_INTERVIEWS" app/api/admin/config/recruiting/route.ts && npx tsc --noEmit`
Expected: grep shows both the import and the `if (step === RecruitingStep.CLOSE_INTERVIEWS)` gate; typecheck produces no output (success)

Do **not** verify this task by actually POSTing `{ step: "close_interviews" }` to the real `/api/admin/config/recruiting` endpoint — that would flip the live production recruiting step, which every real visitor's dashboard reads. The sweep's own logic was already verified in isolation in Task 3; this task only wires a two-line call, which the grep + typecheck above fully confirms. When the user is ready to actually use this feature, they should trigger `CLOSE_INTERVIEWS` deliberately through the real admin UI, not as part of automated verification.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/config/recruiting/route.ts
git commit -m "feat: trigger unscheduled-interview sweep on CLOSE_INTERVIEWS step"
```
