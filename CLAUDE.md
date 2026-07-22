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
(client SDK for Google auth, Admin SDK for all data access) · SWR · AWS SES (email) ·
Google Calendar API (interview scheduling).

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
  `open → reviewing → release_interviews → interviewing → release_trial → trial_workday →
  release_decisions_day1 → day2 → day3`.

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
subcollections), `users`, `config` (docs: `recruiting`, `announcement`, `questions`, `teams`,
`about`, `dashboard`, email templates), `calendarSlotLocks`.

`lib/utils/appCache.ts` is a 10-minute in-memory singleton cache for application lists (keyed
by RBAC scope), the recruiting step, and application questions. Invalidate it after mutating
any of those — it has a 30s invalidation cooldown, so a write may not be visible immediately.

## Content is configuration

Application questions, team/subsystem descriptions, About page copy, dashboard deadlines and
resources, rejection messages, and email templates are all edited by admins at
`/admin/configuration` and stored in Firestore, not hardcoded. When asked to change that kind
of copy, check whether it belongs in the config UI first. `lib/firebase/config.ts` exposes a
`getDefaultX()` for each, used to seed a missing doc.

## Styling

- Brand tokens in `app/globals.css`: `--lhr-gold #FFB526`, `--lhr-gold-light`, `--lhr-orange`,
  `--lhr-blue #045F85`, `--lhr-blue-light`, `--lhr-gray-blue`, `--lhr-burnt-orange`, plus
  `--team-electric` / `--team-solar` / `--team-combustion`.
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
- Secrets live in `.env` (gitignored): Firebase admin credentials, SES keys, Google Calendar
  credentials.

## Git

- Commit messages: **very short**, imperative, lowercase subject. e.g. `fix admin dash`,
  `cache questions`, `add light mode`. No body unless genuinely necessary.
- **Never** add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution to a
  commit or PR.
- Work on `main`; don't push unless asked.
