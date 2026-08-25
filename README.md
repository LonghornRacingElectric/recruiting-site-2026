# Longhorn Racing Recruiting Site

The official recruiting platform for [Longhorn Racing](https://www.longhornracing.org/) at The University of Texas at Austin. Prospective members can learn about the organization, explore teams, and submit applications.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Auth & Database:** Firebase / Firebase Admin
- **Data Fetching:** SWR
- **Email:** AWS SES
- **Analytics & Error Monitoring:** PostHog, Vercel Analytics

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

## Project Structure

```
app/
├── about/          # About page
├── admin/          # Staff console (applications, users, configuration)
├── api/            # API routes (applications, auth, teams, questions)
├── apply/          # Application forms (per-team)
├── auth/           # Authentication pages
├── contact/        # Contact page
├── dashboard/      # Applicant dashboard
├── faq/            # FAQ page
├── teams/          # Team listings
├── timeline/       # Recruiting cycle timeline
├── layout.tsx      # Root layout
└── page.tsx        # Home page

components/         # Shared UI components
hooks/              # SWR data hooks
lib/                # Domain models, Firebase access, auth guards, email
```

## Authors

- [Dhairya Gupta](https://www.linkedin.com/in/dhairyagupta23/)
- [Gray Marshall](https://www.graymarshall.dev/)
- [Celina Yang](https://www.linkedin.com/in/cyang07/)
