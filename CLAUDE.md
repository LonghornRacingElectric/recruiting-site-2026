# CLAUDE.md

Recruiting platform for Longhorn Racing (UT Austin Formula SAE). Public marketing pages +
applicant portal + staff admin console, all in one Next.js app.

## Commands

```bash
npm run dev        # dev server (Turbopack) on :3000
npm run build      # production build (Turbopack) — the only real typecheck we have
npm start          # serve the production build
npm run emulators  # local Firebase emulator suite (project demo-lhr-recruiting)
npm run seed       # seed the emulators with an admin, an applicant, and an open cycle
```

There is no unit-test framework and no lint script. `npm run build` is the typecheck.
Behavioural verification is the emulator harness in `scripts/qa/` — a dozen `*-regress.mjs`
suites that drive the real API routes against the emulators, plus `scripts/qa/sandbox/` for
running a copy of production forward. See the README's local-development section for how to
run them, and `scripts/qa/sandbox/README.md` for the sandbox. **If you change decision, gate,
sweep or audit behaviour, run the matching suite** — that's the only regression net there is.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Firebase
(client SDK for Google auth, Admin SDK for all data access) · SWR · AWS SES (email).
Interview scheduling is a system-lead-managed external signup link, not an in-app
calendar integration.

Both `package-lock.json` and `bun.lock` are committed. If you change dependencies, keep
them in sync: `npm install` regenerates the former, `npx bun install --lockfile-only` the
latter (that works without bun installed — don't skip it).

## Layout

```
app/
  page.tsx, about/, teams/, contact/   public marketing pages
  auth/login/                          Google sign-in → session cookie
  apply/, apply/[team]/                application form (questions come from Firestore config)
  dashboard/                           applicant portal: status, interview scheduling, trial, commit
  admin/                               staff console (see below)
  api/                                 all server routes
components/                            shared public UI (Header, Hero, Footer, InterviewScheduler…)
lib/
  models/                              TypeScript domain types + enums — start here
  firebase/                            all Firestore access (admin SDK), incl. audit.ts
  auth/                                server-side auth guards + SWR fetchers
  email/                               SES sending + template rendering
  utils/statusUtils.ts                 applicant-visible status derivation (important)
  utils/transitions.ts                 STAFF_TRANSITIONS — which status changes staff may make
hooks/                                 SWR hooks (useUser, useApplications, useConfig…)
scripts/qa/                            emulator regression harness + production-copy sandbox
proxy.ts                               route-level redirect middleware
```

There is no `lib/google/`: the in-app calendar/booking stack was deleted when interviews moved
to external signup links. `googleapis` is still in `package.json` but nothing imports it, and
the `GOOGLE_CALENDAR_*` env vars are dead.

`app/admin/` holds `dashboard`, `applications` (the big one — sidebar + detail + scorecards +
CSV export + bulk actions), `stats` (aggregate numbers + trends, all staff), `activity` (the
audit feed — admin + captain only), `users`, `teams`, `configuration` (the CMS), and
`settings`.

Stats are computed in `lib/firebase/stats.ts` from timestamps already on the data (no stored
snapshots, no cron) and cached 5 min. Everything in that payload is a count — never add a
field that identifies an applicant. `GET /api/stats` serves a reduced copy to the recruiting
bot, gated by `STATS_API_TOKEN` (a bearer token, not a user session) so the bot never holds a
staff login.

## Domain model

Types live in `lib/models/`. Read `User.ts` and `Application.ts` before touching anything.

- **Roles** (`UserRole`): `admin`, `team_captain_ob`, `system_lead`, `reviewer`, `applicant`.
  "Staff" = the first four.
- **Teams** (`Team`): `Electric`, `Solar`, `Combustion`. Each has its own system/subsystem
  enum (`ElectricSystem`, `SolarSystem`, `CombustionSystem`) — they are *not* interchangeable.
- **Recruiting pipeline** is driven by one global `RecruitingStep` stored in Firestore
  (`config/recruiting`), advanced by admins:
  `pre_open → open → reviewing → release_interviews → interviewing → close_interviews →
  release_trial → trial_workday → release_decisions_day1 → day2 → day3`.
  Canonical order is `STEP_ORDER` in `statusUtils`, but three files keep their own copy
  (`RECRUITING_STEP_ORDER` in the sidebar, the detail view, and the admin list API) — adding
  a step means updating all four.
- **Two sweeps fire only on an exact transition**, so admins must never skip a step:
  - **into `close_interviews`** — `autoRejectUnscheduledInterviewApplicants()`. Booking is
    external and unverifiable, so the predicate is offer *status*, not attendance: an
    applicant with any `completed` offer is always spared; one whose offers all ended
    (`no_show`/`cancelled`) is rejected; one holding **more than one still-`pending` offer**
    with no `selectedInterviewSystem` is rejected (they never picked, so they never booked).
    A lone pending offer is ambiguous and is left alone — staff mark those no-shows by hand.
  - **into `release_decisions_day2`/`day3`** — `sweepOnDecisionAdvance()`: expires
    unanswered offers released on an earlier day, then rejects a committed applicant's other
    applications. Pass 2 exempts three things, not one: waitlisted applications (the reneg
    pathway), `in_progress` drafts, and acceptances stamped for the day being entered **or
    later** — those are promotions this very advance is about to reveal, and rejecting one
    here would destroy it before the applicant ever saw it. Left unanswered it expires on the
    next advance through pass 1 like any other offer.
  Both are idempotent and re-triggerable: re-saving the same step in Admin → Settings re-runs
  them (the route fires on the target step value, not on change).
- **Reneg is a kill switch on `config/recruiting`**, the boolean field `renegEnabled`
  (default true, toggled in Admin → Settings) — *not* an env var. It changes commit
  semantics; see below.

### Visible status vs. real status — read this before touching applicant-facing code

An application carries internal decisions (`reviewDecision`, `interviewDecision`,
`trialDecision`, `trialDecisionDay`) that staff set as soon as they decide. Applicants must
not see them until the global step reaches the matching release point.

`lib/utils/statusUtils.ts` owns that mapping:

- `getUserVisibleStatus(app, step)` — what the applicant is allowed to see right now.
- `sanitizeApplicationForApplicant(app, step)` — strips internal fields and unreleased
  offers before any applicant-facing response.
- `getStageDecisionForStatus(...)` — which decision field a status change should write.
- `isOfferReleased(app, step)` — **the single source of truth for release-day gating.**
  Review decisions become visible at `release_interviews` and interview decisions at
  `release_trial`, but a *trial* decision releases on its own day: `trialDecisionDay`
  (1|2|3) maps to `release_decisions_day1/2/3`. Status masking, offer stripping and the
  commit path's choice of which rival offers to decline all ask this one function, and they
  must never disagree. `clampDecisionDay()` fails closed to day 1 on junk.

Staff stamp that day explicitly: the status and reject routes accept a `releaseDay` of
`1 | 2 | 3` in the body, validated (not clamped) and rejected with a 400 outside trial-stage
decisions; it defaults from the current step when omitted. Known sharp edge in the reject
route: `rejectApplicationFromSystems` only writes `trialDecisionDay` once *all* trial offers
are rejected, so a `releaseDay` sent with a partial per-system rejection is accepted and then
silently dropped.

Any route serving data to an applicant must go through the sanitizer. It strips
`reviewDecision`/`interviewDecision`/`trialDecision`, `trialDecisionDay`, `aggregateRatings`,
`emailsSent`, `rejectedBySystems`, `autoRejected`, `renegedFrom`, `waitlistSystem` and
`lastEditSession` — none of those may reach a non-staff caller. Add a field to `Application`
and you must decide whether it belongs in that destructuring.

**Commit semantics.** `POST /api/applications/[id]/commit` takes
`{ accepted: boolean, reason?, declineReasons? }`. With reneg enabled, committing declines
only offers **already released** to the applicant (`isOfferReleased`), so a day-2/3
acceptance stamped early survives a day-1 commit, surfaces on its own day, and can be taken
as a reneg; unanswered, it expires on the next advance. With `renegEnabled` false the older
decline-everything behaviour stands, so nobody is shown an offer they cannot take.
Applicants have a Decline button too (`{accepted: false}`) — a day-3 offer has no later
advance to sweep it, so lapsing was never an exit.

**The interview system pick is one-way and narrows staff visibility.** All three teams pick
exactly one system (`selectInterviewSystem`, behind a confirmation modal in
`components/InterviewScheduler.tsx`). It cancels the other pending offers and collapses
`preferredSystems` to the chosen system, stashing the ranking in `originalPreferredSystems`.
Every system-scoped read — `requireStaffForApplication`, `checkTeamAccess`, the Firestore
`array-contains` queries, CSV, counts — keys off `preferredSystems`, so that one write is
what hides the applicant from the systems they didn't pick. Report ranking from
`originalPreferredSystems` **when it is set, falling back to `preferredSystems`** — it is only
written by a pick (or by `joinRanking` adding an unranked system), so it is absent for the many
applicants who only ever held one offer and never saw the picker. Reading it without the
fallback renders an empty ranking for them (`app/dashboard/applications/[id]/page.tsx` has the
shape to copy).

### Where application answers live — read before touching the apply form

Questions come from Firestore (`config/application_questions`) in three scopes, and each
scope stores its answers somewhere different:

| Scope | Configured under | Answers stored in |
|---|---|---|
| Common (everyone) | `commonQuestions` | a *named field* on `formData` if the id is one of six legacy names, otherwise `formData.customAnswers[id]` |
| Team-specific | `teamQuestions[Team]` | `formData.teamQuestions[id]` |
| System-specific | `systemQuestions[System]` | `formData.customAnswers[id]` |

The six named fields are `whyJoin`, `relevantExperience`, `availability`, `graduationYear`,
`major`, `resumeUrl`. Everything else lands in the `customAnswers` bag, because question ids
created in the admin UI are auto-generated (`q_<timestamp>`) and can never match a named
field. **Read answers with `getCommonAnswer()` from `lib/utils/formAnswers.ts`** rather than
reaching into `formData` directly, and render labels from config — never from the field name.

Two traps documented in that file: `formData.availability` holds **phone numbers** (the
question was relabelled in April 2026, so weekly availability is no longer collected), and
system questions only render for systems the applicant actually ranked.

`PATCH /api/applications/[id]` runs incoming `formData` through `sanitizeIncomingFormData()`
(same file): only the named fields and the two string bags survive, answers are clipped to
20k characters, bags to 100 entries with 64-char keys. Live data from before that still
contains junk keys from someone testing.

## Auth

Three layers, and the middleware is the weakest of them:

1. `proxy.ts` — matcher-based redirects. Reads a `user_role` **cookie**, which is
   client-visible and therefore *not* a security boundary. UX only.
2. `lib/auth/guard.ts` — the real check. Verifies the Firebase session cookie server-side:
   - `requireAdmin()` — admin only
   - `requireStaff()` — any of the four staff roles
   - `requireRoles([...])` — staff *and* in a specific subset
   - `requireStaffForApplication(id)` — the above plus per-record scoping: admins see
     everything, captains see their team, system leads/reviewers see their team *and* only
     applications listing their system in `preferredSystems`
3. Per-route checks in `app/api/**` and in server components under `app/admin/**`.

**Every new admin route, server action, and admin page needs an explicit guard call.** Do not
rely on the middleware or on the UI hiding a link. Several recent commits exist purely to fix
places where that was missed.

A guard failure is a thrown `Error`: message `Unauthorized` (no, expired or invalid session —
any Firebase `auth/*` error collapses to this) must become a **401**, because the client
fetcher only logs the user out on 401; `Forbidden…` (wrong role or scope) is a 403. Route
catch blocks use `guardErrorStatus(error)` from `lib/auth/guard.ts` for that mapping. Server
components that only need "who is signed in" (Header, Footer) call `getSessionUser()` from
`lib/auth/sessionUser.ts`, which verifies once per request.

## Data access

All Firestore access goes through `lib/firebase/*` using the Admin SDK (`lib/firebase/admin.ts`
exports `adminDb` / `adminAuth`). Client components never query Firestore directly — they hit
`/api/*` via SWR hooks in `hooks/` using the auth-aware fetchers in `lib/auth/fetcher.ts`
(a 401 auto-logs-out and redirects).

Collections: `applications` (with `notes`, `tasks`, `scorecards`, `interviewScorecards`
subcollections), `users`, `config`, `interviewConfigs`, `scorecardConfigs`, `audit_log`.
(`calendarSlotLocks` and `tokens/google_calendar` still exist in production but nothing
reads them — orphans of the deleted calendar stack, queued for deletion in the wipe.)

`config` docs: `recruiting`, `announcement`, `application_questions`, `teams`, `about_page`,
`dashboard`, `email_templates`, `faq`, `contact_page` (note the `_page` suffix on that last
one), plus `email_run_lock`, which is a runtime lock rather than content.

`lib/utils/appCache.ts` is an in-memory singleton cache (per server instance) holding two
things: the recruiting step (10 min) and the application questions (5 min). Application lists
are **not** cached server-side. Call `invalidateApplications()` after mutating applications or
the step (it always drops the cached step; its 30s cooldown only rate-limits the admin refresh
button) and `invalidateQuestions()` after a question edit. The admin applications list is
cached in the browser instead (`localStorage`, keyed by uid — `lib/utils/adminCache.ts`), and
cleared on logout and on any 401.

The generic branch of `POST /api/admin/applications/[id]/status` writes through
`updateApplicationIfUnchanged()` — a transaction that refuses (409 `ApplicationConflictError`)
if the status changed since the route loaded it. Use it for any new decision-writing route,
and map the error to a 409. Its three other branches, and the reject route, go through their
own transactional helpers instead — `addMultipleInterviewOffers` / `addMultipleTrialOffers`
(the offer-issuing branches), `revertToSubmitted` (the `submitted` branch) and
`rejectApplicationFromSystems` (the reject route). All four re-read inside the transaction but
carry **no** expected-status guard, so none of them has a 409 path today. `revertToSubmitted`
is the one that costs most to lose a concurrent write on: it clears every offer and decision
on the application.

**Which status changes staff may make lives in `lib/utils/transitions.ts`** (`STAFF_TRANSITIONS`):
per target status, the allowed source statuses, the earliest recruiting step, and any role
restriction. The single status route, the reject route and bulk all consult it. Add or relax a
staff status change there, not in a route.

**Mutating admin routes record an audit entry** — `recordAudit` / `recordAuditMany` from
`lib/firebase/audit.ts`, into `audit_log`. Both swallow their own errors, so an audit failure
never fails the request. Refusals are recorded too (`outcome: "refused"`), though not
uniformly: the reject route's role/system 403s return before any entry is written. New
mutating routes should record both the success and the refusal.
The action strings are a union in `lib/models/Audit.ts` with a matching
`AUDIT_ACTION_LABELS` map; adding an action means adding its label. The feed is
`/admin/activity`, gated to admin + team captain (captains see their own team, via
`isVisibleToTeam`).

**Email runs are serialised by a lock** at `config/email_run_lock`. The admin settings page
generates one `runId` per run and POSTs applications in chunks of 50 to
`/api/admin/config/recruiting/trigger-emails`; the same `runId` re-enters the lock, a
different live run gets a 409, and only the final chunk releases it. The lock's TTL is
batch-sized (3 min), not run-sized. Sends are deduped per application — an application whose
`emailsSent` already carries the trigger is skipped unless `force` — and `markEmailSent` uses
`arrayUnion` so concurrent runs can't drop each other's entries. Saving a *release* step in
Admin → Settings auto-offers the matching email run. There is no step→template map: the
trigger is derived from each applicant's `getUserVisibleStatus` at the current step
(`interview_offered`, `trial_offered`, `accepted`, `rejected`, `waitlisted`). Templates are
per-team with **no cross-team fallback** — a missing or disabled one skips and warns.

## Content is configuration

Application questions, team/subsystem descriptions, About page copy, FAQ entries, dashboard
deadlines and resources, rejection messages, and email templates are all edited by admins at
`/admin/configuration` and stored in Firestore, not hardcoded. When asked to change that kind
of copy, check whether it belongs in the config UI first. `lib/firebase/config.ts` exposes a
`getDefaultX()` for each.

**The `getDefaultX()` seeds only apply when the doc doesn't exist.** Production has all of
them, so editing a default in code changes nothing live — the change has to be made in the
admin UI, or by a one-off script against Firestore. Several live docs already diverge from
their code defaults.

Everything config-driven is cached, and the TTLs differ: questions 5 min in `appCache` plus
5 min at the CDN plus 5 min in the applicant's browser (`localStorage`; the admin PUT also
invalidates this instance's in-memory copy), About, teams, FAQ and contact 15 min. Interview
and scorecard configs are **not** cached — those routes read Firestore per request, so an
admin edit is live immediately. If you add a cache, say so in the tab's UI; don't state a
delay that no cache actually enforces.

Two conventions in `lib/firebase/config.ts` worth keeping: section writers `set(..., { merge: true })`
so one tab's save can't blank another's fields, and write paths read with `getX({ strict: true })`
so a transient read failure throws instead of quietly returning `getDefaultX()` and
overwriting live content with the seed.

## Styling

- Three token families in `app/globals.css`, and picking the right one matters:
  - `--lhr-*` — raw brand palette (`--lhr-gold #FFB526`, `--lhr-blue #045F85`,
    `--lhr-gold-light`, `--lhr-orange`, `--lhr-gray-blue`, `--lhr-burnt-orange`).
  - `--pub-*` — **semantic** tokens for every surface an applicant sees (marketing pages,
    login, apply flow, applicant dashboard): `--pub-bg`, `--pub-surface`, `--pub-border`,
    `--pub-heading`, `--pub-text`/`-2`/`-3`, `--pub-link`, `--pub-cta`, `--pub-nav-*`, plus
    the `--status-*` pipeline badges and `--rank1/2/3-*` slots. New applicant-facing UI uses
    these, not raw hexes or `--lhr-*`.
  - `--admin-*` — the admin console's own surface/text/accent set.
- **Team colours come from `lib/teamColors.ts`**, which holds *two* palettes:
  `TEAM_COLORS` / `getTeamColor()` — Electric `#3B82F6`, Solar `#FACC15`, Combustion
  `#FB7185` — for the **admin** console's at-a-glance differentiation, mirrored by the
  `--team-*` CSS vars; and `BRAND_TEAM_COLORS` / `getBrandTeamColor()` — the brand-book amber
  family `#FFB526` / `#FF9404` / `#FFC871` — for **public** surfaces. Use
  `getBrandTeamInk()` for team-coloured *text* (amber fails contrast in light mode; it
  resolves to the theme-aware `--team-*-ink` vars). They're hex strings, not vars, because
  several call sites build translucent variants by suffixing alpha (`${color}15`). Don't
  reintroduce a local `TEAM_COLORS` map — there used to be seven of them.
- Montserrat is the default face; `.font-urbanist` for body copy.
- **`data-theme` is always set** — `"light"` or `"dark"`, never absent. A stored `lhr_theme`
  preference wins; otherwise the theme follows `prefers-color-scheme`, **falling back to
  light**. Applied by a no-flash inline script in `app/layout.tsx` that must stay in sync with
  `ThemeProvider.readStoredTheme`; `ThemeProvider`/`ThemeToggle` live in `app/admin/_components/`
  but are used site-wide. New surfaces must work in both themes.
- Light mode for the admin console still leans on ~250 lines of attribute-selector overrides
  (`[data-theme="light"] [style*="rgba(255,255,255,0.03)"]`…). Any new admin surface using a
  dark value not already in that list will stay dark in light mode — treat the block as a
  checklist. Public surfaces avoid this by going through `--pub-*`.
- The house pattern is Tailwind utilities for layout plus inline `style={{ }}` for brand
  variables. Match it rather than introducing a new abstraction.
- `PublicShell` renders the footer everywhere except `/admin/*`; `Header` is shared and shows
  admin nav links when the session belongs to staff.

## Conventions

- Path alias `@/*` maps to the repo root.
- Server components do auth + data loading; `"use client"` components handle interactivity and
  fetch through SWR hooks.
- API routes return `{ error: string }` with a proper status code on failure; the fetchers
  surface `error`/`message` from the body.
- `react-hot-toast` for user feedback (`ToastProvider` is mounted in the root layout).
- **Server logging goes through `lib/logger.ts`** (`import { logger } from "@/lib/logger"`), never
  a raw `pino()` instance — `logger.error(...)` also reports to PostHog error monitoring, except
  for expected auth denials (`Unauthorized`/`Forbidden…`, expired or revoked session cookies),
  which drop to `warn` so PostHog doesn't file an issue per logged-out user.
  Uncaught server errors are captured by `instrumentation.ts`; client errors by
  `instrumentation-client.ts`, which captures exceptions **only in production** and drops a
  list of known third-party noise (in-app-browser bridges, deploy skew, browser extensions).
  Analytics events use `posthog-js` in client components.
- **PostHog source maps** are uploaded at build time by `next.config.ts`, gated on
  `POSTHOG_API_KEY` + `POSTHOG_PROJECT_ID` + `VERCEL_ENV === "production"` (or
  `POSTHOG_FORCE_SOURCEMAPS=1` for a local test). With the vars set a failed upload **fails
  the build** on purpose; the escape hatch is unsetting `POSTHOG_API_KEY` and redeploying.
- Secrets live in `.env` (gitignored): Firebase admin credentials, SES keys, the stats bearer
  token. See `.env.example` — every var the code actually reads is listed there.

## Ongoing work

`docs/pm-changes.md` tracks the PM's numbered change requests for the 2026 cycle: status per
item, what was actually found while implementing (several items on the sheet turned out to
already work, or to be broken for a different reason than reported), and the open questions
waiting on answers. Reference item numbers in commits — `feat: add FAQ page (#20)`. Update
the item's row in the same commit as the change.

`docs/pm-review-2026-08.md`, `docs/designs/` and `docs/superpowers/` are **dated historical
records** — the questions put to the PM and the designs built from her answers. They are not
maintained against the code and several decisions in them have since been amended (see the
`Amended`/`Re-scoped` notes on the pm-changes rows). Read them for intent, never as the
current spec; the code and this file are the current spec.

Cycle state as of 2026-08-30: the live step is `release_interviews`. Interview scheduling is
external signup links, one per system, stored as `interviewConfigs` docs
(`{id, team, system, signupLink}`) and pasted in by each system lead at Admin →
Configuration → Interviews. `GET /api/applications/[id]/interview` joins the link onto each
pending offer; a system whose lead never pasted one comes back `configMissing: true`, and the
link is withheld from `close_interviews` onward (a pending offer past that point is a status
display, not an invitation to book).

## Git

- Commit messages: conventional prefix + **very short** lowercase imperative subject, e.g.
  `feat: add mobile hamburger menu`, `fix: gate /api/admin/users to ADMIN`. No body unless
  genuinely necessary.
- **Never** add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution to a
  commit or PR.
- Work on `main`; don't push unless asked.
