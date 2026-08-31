# Longhorn Racing Recruiting Site

The official recruiting platform for [Longhorn Racing](https://www.longhornracing.org/) at The University of Texas at Austin. Prospective members can learn about the organization, explore teams, and submit applications.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Auth & Database:** Firebase / Firebase Admin
- **Data Fetching:** SWR
- **Email:** AWS SES
- **Analytics & Error Monitoring:** PostHog (client errors captured in production only,
  with build-time source-map upload), Vercel Analytics + Speed Insights

## Getting Started

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Local development against the Firebase emulators

Without this, `npm run dev` needs a real service-account key and reads/writes
live recruiting data. The emulator suite gives you a throwaway copy instead.

Requires **JDK 21 or newer** on your PATH (`brew install openjdk@21` on macOS,
Temurin 21 on Windows) — `firebase-tools` refuses older Java.

1. Copy `.env.example` to `.env` and uncomment the emulator block (both
   `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are required
   together; with only one set the other service would talk to production).
   The emulators run under the project id `demo-lhr-recruiting`, which the
   Firebase CLI refuses to deploy to — `firebase deploy` from this repo can
   never touch production.
2. `npm run emulators` — terminal 1. Emulator UI at http://localhost:4000.
3. `npm run seed` — terminal 2, once. Creates `admin@utexas.edu`,
   `applicant@utexas.edu`, and an open recruiting cycle.
4. `npm run dev`, then sign in at `/auth/login` — the Google popup becomes the
   emulator's fake account picker; enter one of the seeded addresses.

Switching between the emulator and production in the same browser leaves a
stale session cookie behind — sign out first, or you will see "invalid
signature" errors until you do.

### Regression suites

There is no unit-test framework. `npm run build` is the typecheck; behaviour is
covered by the suites in `scripts/qa/`, which drive the real API routes against
the emulators. They refuse to start unless both emulator variables are set, so
they can never touch production.

Prerequisites: emulators running (step 2), `npm run seed` done (every suite signs
in as the seeded `admin@utexas.edu`), and `npm run dev` up on port 3000 — the
base URL is hardcoded. Then, from the repo root:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node scripts/qa/<name>-regress.mjs
```

Each suite seeds its own users and applications, drives the recruiting step
through the admin API, and prints an `N/M checks passed` line (exit 1 on
failure). Pick the one that covers what you changed:

| Suite | Covers |
|---|---|
| `applicant-gates` | what an applicant may edit, respond to, and see at each step |
| `transitions` | the `STAFF_TRANSITIONS` table across the status, reject and bulk routes |
| `drafts` | no staff action may touch an unsubmitted (`in_progress`) application |
| `sweeps` | the `close_interviews` predicate and the decision-advance sweep |
| `reneg` | commit/decline and reneg semantics — which offers a commit declines |
| `rejection` | per-system rejection, and when someone counts as rejected everywhere |
| `audit` | an actor is recorded on every mutating route, refusals included |
| `users` | who may change roles and manage a team roster |
| `dashboard` | per-system pending counts for leads, reviewers and captains |
| `backlog` | the mixed QA-backlog sweep (release-day tagging, caches, caps, 401s) |
| `stats` | the stats feed: token gate, PII-free shape, numbers match the data |

Two exceptions:

- `stats-regress.mjs` needs the dev server started with
  `STATS_API_TOKEN=test-stats-token` — the suite hardcodes that token.
- `staff-status-regress.ts` tests a pure function, so it needs no emulator, no
  server and no seed: `npx -y tsx scripts/qa/staff-status-regress.ts`.

### Running a copy of production

`scripts/qa/sandbox/` loads a read-only copy of the production database into the
local emulator so a release day can be rehearsed — advance the step, then report
what every applicant would see and render the emails the run would send, without
sending anything. It has its own guide, including the email kill switches and the
before/after fingerprint that proves production was untouched:
[`scripts/qa/sandbox/README.md`](scripts/qa/sandbox/README.md).

`scripts/qa/sandbox/backup.mjs` takes a full production backup (Firestore + Auth).
Note it records only a **manifest** of Cloud Storage objects, not the files
themselves — download the bucket separately before anything Storage-destructive.

## Project Structure

```
app/
├── about/          # About page
├── admin/          # Staff console (applications, activity, users, configuration, settings)
├── api/            # API routes (applications, auth, teams, questions, stats)
├── apply/          # Application forms (per-team)
├── auth/           # Authentication pages
├── contact/        # Contact page
├── dashboard/      # Applicant dashboard
├── faq/            # FAQ page
├── privacy/        # Privacy policy
├── teams/          # Team listings
├── terms/          # Terms of use
├── timeline/       # Recruiting cycle timeline
├── layout.tsx      # Root layout
└── page.tsx        # Home page

components/         # Shared UI components
hooks/              # SWR data hooks
lib/                # Domain models, Firebase access, auth guards, email
scripts/            # Emulator seed, one-off migrations, and the QA suites above
docs/               # PM change tracker and dated design records
proxy.ts            # Route-level redirects (UX only — the guards in lib/auth are the real check)
```

Most user-facing copy is **not** in this repo: application questions, team and subsystem
descriptions, About/FAQ/contact content, dashboard deadlines, rejection messages and email
templates are all edited by admins at `/admin/configuration` and stored in Firestore.

## Authors

- [Dhairya Gupta](https://www.linkedin.com/in/dhairyagupta23/)
- [Gray Marshall](https://www.graymarshall.dev/)
- [Celina Yang](https://www.linkedin.com/in/cyang07/)
