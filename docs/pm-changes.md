# PM change requests — 2026 cycle

Source: PM's tracking sheet. Numbers are stable — use them in commits (`feat: … (#12)`) and
when updating the sheet. Status values: `todo`, `in progress`, `done`, `blocked`, `needs info`.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Question ordering — phone # can't be moved to top, should sit after name (list + order linked) | **done (UI) — config action pending** | `QuestionsTab` had a `GripVertical` handle styled `cursor-move` that was never wired to anything, so questions could only be appended or deleted. Real up/down controls added for common, team and system questions, with the position number shown. **Someone still needs to drag the phone question up in `/admin/configuration` → Questions and save.** Note there is no "name" question to sit after — name comes from Google auth, so "after name" means first. |
| 2 | Wipe all applicant data, keep all reviewer data | todo | Destructive. 1306 applications live (1000 `isFakeData`, ~306 real — all org members testing, per Gray, so losing them is acceptable but avoid if easy). Needs a backup + a scoped script; run after schema changes land. |
| 3 | Light mode (mainly reviewer side) | **done — visually verified by Gray 2026-07-22** | Implemented: theme vars + `data-theme="light"` + ~250 lines of override CSS covering admin and public. See audit note below. |
| 4 | Update colors per team — hexcodes provided (electric, solar, IC) | **done** | PM hexes: Electric `#3B82F6` (Azure Blue), Solar `#FACC15` (Gold), Combustion `#FB7185` (Coral). Only Electric actually changed — the other two already matched. All team colouring now reads from `lib/teamColors.ts`. |
| 5 | Interview scheduler → interview config becomes a link input to a GCal signup entered per system lead; after picking a system, show that system's signup link + a "do not distribute" notice | todo | Replaces the current slot-reservation scheduler. Interacts with #6. |
| 6 | New step "interview start" — applicants must pick which system they interview for; auto-reject on no response | **done (Celina, PR #9)** | Final design: new `CLOSE_INTERVIEWS` step between `interviewing` and `release_trial`; on that exact transition, a sweep rejects every interview-stage applicant with no offer in `scheduled`/`completed` (all teams — the no-show signal is booking, not system selection). Rejections masked until `release_trial` as usual. **The sweep only fires on the exact transition — admins must not skip from Interviewing straight to Release Trial** (noted in the step description). |
| 7 | Update domain to say `lhr` not `lhre` | **done (2026-08-03)** | Org bought `lhrrecruiting.org` (Name.com), canonical host = apex (no www), attached to the org Vercel + Firebase authorized domains. All URLs updated: code defaults (`EmailTemplate.ts` ×4, `send.ts`, `calendar.ts` — the last was writing broken `recruiting.longhornracing.org` links into calendar invites) and the 4 links in live Firestore templates (backup in session scratchpad). Other config docs scanned — no old-domain URLs. Per Gray: `recruiting.lhre.org` will NOT redirect — links in last cycle's sent emails die when the old hosting is deactivated (accepted; that cohort already has decisions). longhornracing.org expiry 2026-09-29 remains an org-level risk (Wix site), not a recruiting-site concern. | Live site is `recruiting.lhre.org` (lhre.org DNS is on Cloudflare). Findings: (1) a `recruiting.longhornracing.org` CNAME **already exists**, pointing at a Vercel per-project target — someone attached it to a Vercel project once; today it serves a Vercel 404 with a bad cert, i.e. not attached to any live project. (2) longhornracing.org's DNS is hosted at **Wix** (ns10/ns11.wixdns.net) — whoever administers the org's Wix marketing site controls the DNS; that's who to find. (3) Registrar is **Squarespace Domains** (ex-Google Domains) and the registration **expires 2026-09-29** — if the owner isn't found before then, the org may lose the whole domain, Wix site included. Migration itself is cheap whenever unblocked: identity is Firebase-UID-based, nothing user-facing is tied to the serving domain (see notes in this row's commit). Code URL fixes (EmailTemplate.ts ×4, send.ts:113, live Firestore templates) wait until the target domain is settled. |
| 8 | Acceptances — applicant must accept offer before next round or auto-reject; waitlist promotion allows reneging (round 2 only), prior offer flips to rejected; accepting another team's offer auto-rejects the rest | todo | Biggest item. Cross-team logic + new applicant-facing accept flow. |
| 9 | New optional question with larger file/page size for portfolio | **done** | Optional upload below the resume: PDF / PNG / JPG / WEBP / GIF / ZIP, **25MB**, no page limit, copy explicitly invites non-engineering creative work. Stored at `portfolios/{userId}/{applicationId}/`, `formData.portfolioUrl`. Shown as a link (not an embed — could be a zip) in the reviewer detail view, plus a CSV column. Written as a separate handler/section so it doesn't collide with Celina's resume work in the same file. |
| 10 | Limit resume to 2 pages; add McCombs resume template link to the question | **done (Celina, PR #9)** | Client-side page count via `pdf-lib` (`ignoreEncryption: true` so protected-but-valid PDFs pass), template link added above the upload. Validation is client-only — consistent with the existing size/type checks. |
| 11 | Make ranked system order clearer to the applicant when selecting systems | **done** | Apply form now has a "Your ranking" panel listing 1st/2nd/3rd choice with up/down reorder + remove (previously the only way to change order was to deselect everything and re-pick). Ranking is also shown on the dashboard card and application detail page, where it used to be a flat comma list. Rank colours no longer derive from the team accent — with Electric at `#3B82F6` that made ranks 1 and 3 identical. |
| 12 | TCs/admins can accept to another system; system leads limited to their own system (route through TC) | **done** | `POST .../status` rejects an ACCEPTED with an `offer.system` other than the lead's own, naming their TC as the fix. Accept modal filters the dropdown to their system, defaults to it, and explains the limit. Admins/captains unchanged. PM answered 2026-07-22: fence interviews too (with TC override), leave trial/waitlist/reject unfenced — "i trust people wont be dumb with that". Interview offers now fenced the same way; a lead must pick an explicit system (the old fallback to *all* preferred systems would have offered on other systems' behalf). |
| 13 | "Edit application" button, hidden once applications close | **done** | Edit-in-place: a submitted application stays `submitted` while being edited (no risk of an applicant being silently left unsubmitted). Gated on `RecruitingStep.OPEN` in the API and the UI. Editing re-stamps `submittedAt` per PM's call — note autosave means that happens on every edit, not just on the button. |
| 14 | Reviewers *can't* see `in_progress` applications, only submitted | **done** | Read as a complaint, not a requirement (confirmed w/ Gray): she wants drafts visible. Staff list API no longer strips them; sidebar pre-selects every status except "In Progress", so drafts stay out of the default view and clearing filters shows everything. PM confirmed drafts must not be scorable: both scorecard POST routes reject `in_progress`, and the scorecard panel explains why instead of rendering the form. |
| 15 | Once an applicant picks their system, propagate to reviewers and auto-hide from systems they didn't pick | **unblocked — ready to build** | #6 landed. The pick event is `selectedInterviewSystem` (written by `POST /api/applications/[id]/interview`, unchanged by Celina's redesign) — currently displayed nowhere staff-facing. Part A: surface it (sidebar row, detail view, CSV). Part B: hide the applicant from non-picked systems' reviewers — scoping is `preferredSystems array-contains`, so hiding is a filter change in the list API; decide whether hiding kicks in at selection time or only from `CLOSE_INTERVIEWS`. |
| 16 | On rejection, show which systems on which teams rejected; "fully rejected" only if rejected everywhere | **needs scope decision (Gray holding)** | Each application is one team, so `rejectedBySystems` already answers "which systems" — but `/related` and `batchGetOtherTeamApplications` don't return it, so the cross-team view is impossible today. Open: (1) admin-only, or does the applicant-facing status/emails change too — the latter means reworking `statusUtils` release gating; (2) do waitlisted / self-declined count as "still alive" for the "anywhere" rollup? Note `getDisplayStatusForUser` already does system-level nuance in the sidebar; this would extend it across teams. |
| 17 | "Unreviewed by <system>" filter broken | **done** | It only knew about offers/rejections, which don't exist during the REVIEWING step — so during review every application looked unreviewed. Now counts a scorecard from your system as reviewed (via `aggregateRating`, which the API already scopes to the viewer's system). Semantics are *system-level*: once anyone in your system scores an applicant they leave the list. A per-reviewer ("unreviewed by me") variant would need the list API to return which apps the current user has personally scored. **Also note:** the pill only renders for users with `memberProfile.system` — admins without a system never see this filter at all. |
| 18 | Show system rankings in the preferred-systems column and when accepting/rejecting | **done** | Was inconsistent, not missing: full-screen list and the interview offer modal already showed ranks. Added them to the sidebar rows, the "Applicant Interests" panel and the reject modal. Detail header was already numbered. |
| 19 | Trial workday email includes the system applied to | **done** | PM confirmed she just wants the invited-to system named, and it already was: live `trial_offered` template has `{{systemNames}}`, populated from `trialOffers`. Only fix needed was the empty-offer case, which rendered the literal word "General" (1 of 173 trial emails, 1 of 209 interview emails) — now falls back to `preferredSystems` and logs a warning. |
| 20 | FAQ page with admin-editable, reorderable questions | **done** | Public `/faq` (accordion, linked from header + footer), `config/faq` doc, public `GET /api/faq` (15 min cache), admin `GET/PUT /api/admin/config/faq`, and an admin-only FAQ tab with add/edit/delete/reorder. Seeded with the PM's 9 questions. |
| 21 | Optional short answer for LinkedIn profile link | **done — pending visual check** | Admin-added common questions now persist (`formData.customAnswers`) and show up for reviewers + in the CSV. `linkedin` question added to the live config and to the code defaults. **TODO (Gray): confirm the field actually renders on the apply form** — server cache 10 min, browser `localStorage` cache 30 min, so hard-refresh first. |
| 22 | OPS dropdown with PR, CR, Treasury inputs (shown only if OPS selected) | **done** | System questions were fully built (model, admin editor, `/api/questions`) but the apply form never rendered them — now it does, for ranked systems only, storing answers in `customAnswers`. Added `ops_area` (select: PR / CR / Treasury, required) under `systemQuestions.Operations`, which covers all three teams since the system name is shared. Answers show in the reviewer detail view and CSV. |

## Findings not on the PM's sheet

Turned up while working the list. Unnumbered so the PM's numbering stays stable.

- **`formData.availability` holds phone numbers.** The live config relabelled that question
  to "Phone Number" (2026-04-28) because reusing a named field was the only way to add a
  question that saved. Weekly availability has not been collected since. Documented in
  `lib/utils/formAnswers.ts`.
- **The CSV export column headed "Availability" therefore contains phone numbers.** Left as-is
  so existing sheet formulas don't break — worth renaming when #1 is fixed properly.
- **Question ids are auto-generated and uneditable.** `QuestionsTab.addQuestion` assigns
  `q_<timestamp>`; admins can't choose an id. This is why new common questions could never map
  to a named field. Relevant to #1, #20, #22.
- **`PATCH /api/applications/[id]` accepts arbitrary `formData` keys** and merges them straight
  into the document. Live data already contains junk keys (`__internal_override`, `role`, `z`,
  `dup`, `"  spaces  "`) — probably someone testing, but an applicant can write arbitrary
  fields into their own application. Not fixed yet; needs a server-side whitelist.
- **The CSV export still excludes `in_progress`** (`export-csv/route.ts:105-108`) even though staff can
  now see drafts on screen. Left deliberately — drafts are incomplete — but it means the export and
  the list can disagree on counts.
- **Reviewers could not see phone numbers.** The application detail view rendered two
  hardcoded question labels that no longer matched the config, and skipped everything else.
  Now rendered from config (fixed under #21).

## Audit — items marked done on the sheet

### 3. Light mode — real, but verify visually
Genuinely implemented, and it does cover the reviewer/admin side:
- `ThemeProvider` + `ThemeToggle` (`app/admin/_components/`), used site-wide via the header.
- No-flash inline script in `app/layout.tsx`; preference persisted to `localStorage` under
  `lhr_theme`, synced across tabs.
- `[data-theme="light"]` block in `globals.css` redefines the admin surface/text/border vars,
  then ~250 lines of overrides flip Tailwind `*-white/X` classes and inline dark styles.

Caveat: much of it works by matching inline styles with attribute selectors
(`[style*="rgba(255,255,255,0.03)"]`). That is fragile — any new admin component that uses a
dark value not already in that list will stay dark in light mode. Treat the override block as
a checklist to update whenever a new admin surface is added.

### 4. Team colors — resolved 2026-07-22
Fixed: `lib/teamColors.ts` is now the single source of truth, consumed by all 7 former copies,
by `TEAM_INFO`, by the apply-form accent, and mirrored in the `--team-*` CSS vars. Two knock-on
visual changes worth knowing: the `/apply` team cards and the apply form's accent colour used to
use LHR gold/orange (`#FFB526` / `#FF9404` / `#FFC871`) and now use the team palette.

Original audit follows.

### 4. Team colors — not actually done (original finding)
`--team-electric` / `--team-solar` / `--team-combustion` were added to `globals.css` in
`44b14a7`, but:
- **The vars are referenced nowhere.** Every consumer keeps its own hardcoded `TEAM_COLORS`
  map — `ApplicationDetail.tsx`, `ApplicationsSidebar.tsx`, `FullScreenListView.tsx`,
  `app/dashboard/page.tsx`, `app/dashboard/applications/[id]/page.tsx`, `app/teams/page.tsx`,
  `app/page.tsx` (7 copies).
- **The values are Tailwind defaults**, not brand colors: `#60a5fa` = blue-400,
  `#facc15` = yellow-400, `#fb7185` = rose-400.

So the colors were unified in appearance only. Fixing this means applying the PM's hexcodes to
the vars and pointing all 7 files at them.
