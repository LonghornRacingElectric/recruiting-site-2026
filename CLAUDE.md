# CLAUDE.md

Recruiting platform for Longhorn Racing (UT Austin Formula SAE). Public marketing pages +
applicant portal + staff admin console, all in one Next.js app.

## Commands

```bash
npm run dev     # dev server (Turbopack) on :3000
npm run build   # production build — the only real typecheck we have
npm start       # serve the production build
```

There is no test suite and no lint script. `npm run build` is the verification step.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Firebase
(client SDK for Google auth, Admin SDK for all data access) · SWR · AWS SES (email).
Interview scheduling is a system-lead-managed external signup link, not an in-app
calendar integration.

Both `package-lock.json` and `bun.lock` are committed. If you change dependencies, keep
them in sync (`npm install` regenerates the former, `bun install` the latter).

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
  firebase/                            all Firestore access (admin SDK)
  auth/                                server-side auth guards + SWR fetchers
  email/, google/                      SES sending, Calendar integration
  utils/statusUtils.ts                 applicant-visible status derivation (important)
hooks/                                 SWR hooks (useUser, useApplications, useConfig…)
proxy.ts                               route-level redirect middleware
```

`app/admin/` holds `dashboard`, `applications` (the big one — sidebar + detail + scorecards +
CSV export + bulk actions), `users`, `teams`, `configuration` (the CMS), and `settings`.

## Domain model

Types live in `lib/models/`. Read `User.ts` and `Application.ts` before touching anything.

- **Roles** (`UserRole`): `admin`, `team_captain_ob`, `system_lead`, `reviewer`, `applicant`.
  "Staff" = the first four.
- **Teams** (`Team`): `Electric`, `Solar`, `Combustion`. Each has its own system/subsystem
  enum (`ElectricSystem`, `SolarSystem`, `CombustionSystem`) — they are *not* interchangeable.
- **Recruiting pipeline** is driven by one global `RecruitingStep` stored in Firestore
  (`config/recruiting`), advanced by admins:
  `open → reviewing → release_interviews → interviewing → close_interviews → release_trial →
  trial_workday → release_decisions_day1 → day2 → day3`.
  The transition **to** `close_interviews` runs a one-shot sweep auto-rejecting interview-stage
  applicants who never got an offer to `scheduled`/`completed` — it only fires on that exact
  transition, so don't skip the step. Step comparisons use ordered arrays duplicated in
  several files (`statusUtils`, sidebar, detail, list API) — adding a step means updating all
  of them.

### Visible status vs. real status — read this before touching applicant-facing code

An application carries internal decisions (`reviewDecision`, `interviewDecision`,
`trialDecision`, `trialDecisionDay`) that staff set as soon as they decide. Applicants must
not see them until the global step reaches the matching release point.

`lib/utils/statusUtils.ts` owns that mapping:

- `getUserVisibleStatus(app, step)` — what the applicant is allowed to see right now.
- `sanitizeApplicationForApplicant(app, step)` — strips internal fields and unreleased
  offers before any applicant-facing response.
- `getStageDecisionForStatus(...)` — which decision field a status change should write.

Any route serving data to an applicant must go through the sanitizer. Never leak
`reviewDecision`/`interviewDecision`/`trialDecision`, `aggregateRatings`, `emailsSent`, or
`rejectedBySystems` to a non-staff caller.

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

`PATCH /api/applications/[id]` merges whatever `formData` object it receives, so applicants
can currently write arbitrary keys into their own document. Live data already contains junk
from someone testing. A server-side whitelist is still owed.

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

## Data access

All Firestore access goes through `lib/firebase/*` using the Admin SDK (`lib/firebase/admin.ts`
exports `adminDb` / `adminAuth`). Client components never query Firestore directly — they hit
`/api/*` via SWR hooks in `hooks/` using the auth-aware fetchers in `lib/auth/fetcher.ts`
(a 401 auto-logs-out and redirects).

Collections: `applications` (with `notes`, `tasks`, `scorecards`, `interviewScorecards`
subcollections), `users`, `config`, `interviewConfigs`, `scorecardConfigs`,
`calendarSlotLocks`, `tokens`.

`config` docs: `recruiting`, `announcement`, `application_questions`, `teams`, `about_page`,
`dashboard`, `email_templates`, `faq`.

`lib/utils/appCache.ts` is a 10-minute in-memory singleton cache for application lists (keyed
by RBAC scope), the recruiting step, and application questions. Invalidate it after mutating
any of those — it has a 30s invalidation cooldown, so a write may not be visible immediately.

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

Everything config-driven is cached, and the TTLs differ: questions 2h server-side plus 30 min
in the applicant's browser (`localStorage`), About, teams and FAQ 15 min. Interview and
scorecard configs are **not** cached — those routes read Firestore per request, so an admin
edit is live immediately. If you add a cache, say so in the tab's UI; don't state a delay
that no cache actually enforces.

## Styling

- Brand tokens in `app/globals.css`: `--lhr-gold #FFB526`, `--lhr-gold-light`, `--lhr-orange`,
  `--lhr-blue #045F85`, `--lhr-blue-light`, `--lhr-gray-blue`, `--lhr-burnt-orange`.
- **Team colours come from `lib/teamColors.ts`** — Electric `#3B82F6`, Solar `#FACC15`,
  Combustion `#FB7185`. That file is the single source of truth; the `--team-*` CSS vars
  mirror it for CSS-only usage. They're hex strings, not vars, because several call sites
  build translucent variants by suffixing alpha (`${color}15`). Don't reintroduce a local
  `TEAM_COLORS` map — there used to be seven of them.
- Montserrat is the default face; `.font-urbanist` for body copy.
- Dark-first. Light mode is a `data-theme="light"` attribute set by a no-flash inline script in
  `app/layout.tsx`; `ThemeProvider`/`ThemeToggle` live in `app/admin/_components/` but are used
  site-wide. New surfaces must work in both themes.
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
  a raw `pino()` instance — `logger.error(...)` also reports to PostHog error monitoring.
  Uncaught server errors are captured by `instrumentation.ts`; client errors by
  `instrumentation-client.ts`. Analytics events use `posthog-js` in client components.
- Secrets live in `.env` (gitignored): Firebase admin credentials, SES keys, Google Calendar
  credentials.

## Ongoing work

`docs/pm-changes.md` tracks the PM's numbered change requests for the 2026 cycle: status per
item, what was actually found while implementing (several items on the sheet turned out to
already work, or to be broken for a different reason than reported), and the open questions
waiting on answers. Reference item numbers in commits — `feat: add FAQ page (#20)`. Update
the item's row in the same commit as the change.

## Git

- Commit messages: conventional prefix + **very short** lowercase imperative subject, e.g.
  `feat: add mobile hamburger menu`, `fix: gate /api/admin/users to ADMIN`. No body unless
  genuinely necessary.
- **Never** add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution to a
  commit or PR.
- Work on `main`; don't push unless asked.
