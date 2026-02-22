# Longhorn Racing Recruiting Site

The official recruiting platform for [Longhorn Racing](https://www.longhornracing.org/) at The University of Texas at Austin. Prospective members can learn about the organization, explore teams, and submit applications.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Auth & Database:** Firebase / Firebase Admin
- **Data Fetching:** SWR
- **APIs:** Google APIs (Sheets/Drive integration)

## Getting Started

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Project Structure

```
app/
├── about/          # About page
├── admin/          # Admin dashboard
├── api/            # API routes (applications, auth, teams, questions)
├── apply/          # Application forms (per-team)
├── auth/           # Authentication pages
├── contact/        # Contact page
├── dashboard/      # Applicant dashboard
├── teams/          # Team listings
├── layout.tsx      # Root layout
└── page.tsx        # Home page

components/         # Shared UI components
```

## Authors

- [Dhairya Gupta](https://www.linkedin.com/in/dhairyagupta23/)
- [Gray Marshall](https://www.graymarshall.dev/)
