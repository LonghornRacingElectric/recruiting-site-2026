# PM change requests — 2026 cycle

Source: PM's tracking sheet. Numbers are stable — use them in commits (`feat: … (#12)`) and
when updating the sheet. Status values: `todo`, `in progress`, `done`, `blocked`, `needs info`.

Rows were last checked against the code on **2026-08-30**. "done (code) — live doc unverified"
means the repo is correct but a Firestore config doc could still diverge: `getDefaultX()` seeds
apply only while the doc does not exist, and production has most of them. Items that depend on
Vercel, DNS, AWS or Firestore state (the launch/ops board below) cannot be verified from the
repo at all — treat their dates as the last time a human looked.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Question ordering — phone # can't be moved to top, should sit after name (list + order linked) | **done (UI) — config action pending** | `QuestionsTab` had a `GripVertical` handle styled `cursor-move` that was never wired to anything, so questions could only be appended or deleted. Real up/down controls added for common, team and system questions, with the position number shown. **Someone still needs to drag the phone question up in `/admin/configuration` → Questions and save.** Note there is no "name" question to sit after — name comes from Google auth, so "after name" means first. |
| 2 | Wipe all applicant data | **executed 2026-08-05** | Scope per PM Q10 + Gray: everything except the 3 admin accounts (staff roles were test promotions). `scripts/wipe-cycle-data.mjs` (dry-run default) — 1,309 applications + subcollections, 1,210 users, 375 stored resumes, slot locks, calendar token. Firestore backup in `Downloads/lhr-wipe-backup-2026-08-05/`; storage files not backed up (accepted). |
| 3 | Light mode (mainly reviewer side) | **done — visually verified by Gray 2026-07-22** | Implemented: theme vars + `data-theme="light"` + ~250 lines of override CSS covering admin and public. See audit note below. |
| 4 | Update colors per team — hexcodes provided (electric, solar, IC) | **done** | PM hexes: Electric `#3B82F6` (Azure Blue), Solar `#FACC15` (Gold), Combustion `#FB7185` (Coral). Only Electric actually changed — the other two already matched. All team colouring now reads from `lib/teamColors.ts`. |
| 5 | Interview scheduler → interview config becomes a link input to a GCal signup entered per system lead; after picking a system, show that system's signup link + a "do not distribute" notice | **done (Celina, PR #10, 2026-08-04)** | Entire in-app calendar stack deleted (booking route, `lib/google/calendar.ts`, slot locks). `interviewConfigs` docs are now `{id, team, system, signupLink}` with server-side URL validation; applicants see the link + do-not-distribute warning with copy/open actions. |
| 6 | New step "interview start" — applicants must pick which system they interview for; auto-reject on no response | **done (Celina, PR #9)** | Final design: new `CLOSE_INTERVIEWS` step between `interviewing` and `release_trial`; on that exact transition, a sweep rejects every interview-stage applicant with no offer in `scheduled`/`completed` (all teams — the no-show signal is booking, not system selection). Rejections masked until `release_trial` as usual. **The sweep only fires on the exact transition — admins must not skip from Interviewing straight to Release Trial** (noted in the step description). **Re-scoped in PR #10 (sweep v3):** with booking external and unverifiable, it now only rejects multi-offer applicants who never picked a system; single-offer applicants are never auto-rejected — **staff must manually mark no-shows** via the existing Completed/Cancelled/No-show action. **Re-scoped again in PR #140 (2026-08-30):** Solar picks one system like the other teams, so the never-picked rule covers all three teams — and only still-PENDING offers count toward "multiple", so nobody is rejected for failing to pick among dead options. |
| 7 | Update domain to say `lhr` not `lhre` | **done (2026-08-03)** | Org bought `lhrrecruiting.org` (Name.com), canonical host = apex (no www), attached to the org Vercel + Firebase authorized domains. All URLs updated: code defaults (`EmailTemplate.ts` ×4, `send.ts`, `calendar.ts` — the last was writing broken `recruiting.longhornracing.org` links into calendar invites) and the 4 links in live Firestore templates (backup in session scratchpad). Other config docs scanned — no old-domain URLs. Per Gray: `recruiting.lhre.org` will NOT redirect — links in last cycle's sent emails die when the old hosting is deactivated (accepted; that cohort already has decisions). longhornracing.org expiry 2026-09-29 remains an org-level risk (Wix site), not a recruiting-site concern. |
| 8 | Acceptances — applicant must accept offer before next round or auto-reject; waitlist promotion allows reneging (round 2 only), prior offer flips to rejected; accepting another team's offer auto-rejects the rest | **done (feat/acceptance-bundle)** | Built per PM answers Q1–Q6: Commit/Decline is the accept (final, one-shot); `sweepOnDecisionAdvance` on entering Day 2/3 expires unanswered earlier-day offers and rejects committed users' other apps (waitlisted exempt — reneg pathway); reneg gated to Day 2+, behind a kill switch (PM's "maybe not this") — the boolean `renegEnabled` on `config/recruiting`, default true, toggled in Admin → Settings; it is a config field, not an env var; `autoRejected {reason, at}` gives staff the why. Sweeps fire only on exact transitions — don't skip decision days. **Amended 2026-08-30 (`adding-reneg-feature`):** a commit no longer declines offers the applicant had not been shown — only ones already released, per the new `isOfferReleased()` in `statusUtils`. A day-2/3 acceptance stamped early now survives a day-1 commit, surfaces on its own release day, and can be taken as a reneg; left unanswered it expires on the next advance through the existing pass 1. Gated on `renegEnabled` directly rather than `renegWindowOpen`, whose round-2 half is still false on the day the commit runs — with reneg switched off, the old decline-everything behaviour stands so no one is shown an offer they cannot take. Admin detail flags an ACCEPTED applicant who is already committed elsewhere. Deliberately unchanged: the jilted team gets no notification (Q5B), and the applicant still receives that team's rejection email afterwards. Also wired a **Decline** button (with an are-you-sure modal and optional reason) into the CommitmentPicker: `POST .../commit {accepted:false}` and `ApplicationStatus.DECLINED` both existed since the original bundle, but nothing in the UI ever called them, so the only way to turn an offer down was to let it lapse — and a day-3 offer, with no advance left to sweep it, never lapsed at all. |
| 9 | New optional question with larger file/page size for portfolio | **done** | Optional upload below the resume: PDF / PNG / JPG / WEBP / GIF / ZIP, **25MB**, no page limit, copy explicitly invites non-engineering creative work. Stored at `portfolios/{userId}/{applicationId}/`, `formData.portfolioUrl`. Shown as a link (not an embed — could be a zip) in the reviewer detail view, plus a CSV column. Written as a separate handler/section so it doesn't collide with Celina's resume work in the same file. |
| 10 | Limit resume to 2 pages; add McCombs resume template link to the question | **done (Celina, PR #9)** | Client-side page count via `pdf-lib` (`ignoreEncryption: true` so protected-but-valid PDFs pass), template link added above the upload. Validation is client-only — consistent with the existing size/type checks. |
| 11 | Make ranked system order clearer to the applicant when selecting systems | **done** | Apply form now has a "Your ranking" panel listing 1st/2nd/3rd choice with up/down reorder + remove (previously the only way to change order was to deselect everything and re-pick). Ranking is also shown on the dashboard card and application detail page, where it used to be a flat comma list. Rank colours no longer derive from the team accent — with Electric at `#3B82F6` that made ranks 1 and 3 identical. |
| 12 | TCs/admins can accept to another system; system leads limited to their own system (route through TC) | **done** | `POST .../status` rejects an ACCEPTED with an `offer.system` other than the lead's own, naming their TC as the fix. Accept modal filters the dropdown to their system, defaults to it, and explains the limit. Admins/captains unchanged. PM answered 2026-07-22: fence interviews too (with TC override), leave trial/waitlist/reject unfenced — "i trust people wont be dumb with that". Interview offers now fenced the same way; a lead must pick an explicit system (the old fallback to *all* preferred systems would have offered on other systems' behalf). |
| 13 | "Edit application" button, hidden once applications close | **done** | Edit-in-place: a submitted application stays `submitted` while being edited (no risk of an applicant being silently left unsubmitted). Gated on `RecruitingStep.OPEN` in the API and the UI. Editing re-stamps `submittedAt` per PM's call — note autosave means that happens on every edit, not just on the button. |
| 14 | Reviewers *can't* see `in_progress` applications, only submitted | **done** | Read as a complaint, not a requirement (confirmed w/ Gray): she wants drafts visible. Staff list API no longer strips them; sidebar pre-selects every status except "In Progress", so drafts stay out of the default view and clearing filters shows everything. PM confirmed drafts must not be scorable: both scorecard POST routes reject `in_progress`, and the scorecard panel explains why instead of rendering the form. |
| 15 | Once an applicant picks their system, propagate to reviewers and auto-hide from systems they didn't pick | **done (Celina, PR #10, 2026-08-04)** | Selection collapses `preferredSystems` to the picked system (original ranking preserved in `originalPreferredSystems` per review) and cancels other pending offers — hiding follows automatically everywhere that scopes on `preferredSystems` (lists, guard, CSV, counts). Part A (surfacing) is largely moot: post-pick, staff see exactly the picked system in the preferred-systems column. |
| 16 | On rejection, show which systems on which teams rejected; "fully rejected" only if rejected everywhere | **done (feat/acceptance-bundle)** | Staff-only per Q7. `/related` returns per-app `rejectedBySystems` + auto-reject context; detail header shows rejected-related chips with their systems and a rollup badge (Committed at X / still active at Y / declined at Z / Rejected everywhere). Q8 masking server-side: waitlists at other teams render as "Inactive" unless the viewer is admin or that team's staff (system-matched for leads/reviewers). |
| 17 | "Unreviewed by <system>" filter broken | **done** | It only knew about offers/rejections, which don't exist during the REVIEWING step — so during review every application looked unreviewed. Now counts a scorecard from your system as reviewed (via `aggregateRating`, which the API already scopes to the viewer's system). Semantics are *system-level*: once anyone in your system scores an applicant they leave the list. A per-reviewer ("unreviewed by me") variant would need the list API to return which apps the current user has personally scored. **Also note:** the pill only renders for users with `memberProfile.system` — admins without a system never see this filter at all. |
| 18 | Show system rankings in the preferred-systems column and when accepting/rejecting | **done** | Was inconsistent, not missing: full-screen list and the interview offer modal already showed ranks. Added them to the sidebar rows, the "Applicant Interests" panel and the reject modal. Detail header was already numbered. |
| 19 | Trial workday email includes the system applied to | **done** | PM confirmed she just wants the invited-to system named, and it already was: live `trial_offered` template has `{{systemNames}}`, populated from `trialOffers`. Only fix needed was the empty-offer case, which rendered the literal word "General" (1 of 173 trial emails, 1 of 209 interview emails) — now falls back to `preferredSystems` and logs a warning. |
| 20 | FAQ page with admin-editable, reorderable questions | **done** | Public `/faq` (accordion, linked from header + footer), `config/faq` doc, public `GET /api/faq` (15 min cache), admin `GET/PUT /api/admin/config/faq`, and an admin-only FAQ tab with add/edit/delete/reorder. Seeded with the PM's 9 questions. |
| 21 | Optional short answer for LinkedIn profile link | **done — pending visual check** | Admin-added common questions now persist (`formData.customAnswers`) and show up for reviewers + in the CSV. `linkedin` question added to the live config and to the code defaults. **TODO (Gray): confirm the field actually renders on the apply form** — question caches are 5 min server-side, 5 min at the CDN and 5 min in the browser (`localStorage`), so hard-refresh first. |
| 22 | OPS dropdown with PR, CR, Treasury inputs (shown only if OPS selected) | **done** | System questions were fully built (model, admin editor, `/api/questions`) but the apply form never rendered them — now it does, for ranked systems only, storing answers in `customAnswers`. Added `ops_area` (select: PR / CR / Treasury, required) under `systemQuestions.Operations`, which covers all three teams since the system name is shared. Answers show in the reviewer detail view and CSV. |
| 23 | Remove LinkedIn from the contact page (keep it elsewhere, e.g. footer) | **done (code) — live doc unverified** | From PM via Slack 2026-08-04. Shipped as part of #26: the contact page renders channels from `config/contact_page`, and the seed carries Instagram only. LinkedIn is still in the footer as asked. **Caveat: the seed only applies while `config/contact_page` does not exist** — if an admin has saved the tab, check the live doc. |
| 24 | Contact page copy: email must be `longhornracingrecruitment@gmail.com` ("Contact with any questions about the recruiting process"), IG blurb "follow for live updates on all recruiting events" | **done (code) — live doc unverified** | From PM via Slack 2026-08-04. Exactly this copy is now the `getDefaultContactPageConfig()` seed (email, email description, IG blurb). Same caveat as #23: a saved `config/contact_page` doc wins over the seed. |
| 25 | Per-team interview-detail emails | **done (feat/acceptance-bundle)** | PM chose full per-team templates (Q9): config is now `teams: {Electric/Solar/Combustion: EmailTemplate[]}` (15 total), legacy flat doc auto-expands on read, Emails tab gained a team selector, and sends use the applicant's team's template with **no cross-team fallback** (missing/disabled → skip + warn). |
| 26 | Contact page fields editable in the admin panel | **done** | From PM via Slack 2026-08-04. `config/contact_page` (note the `_page` suffix — not `config/contact`), `GET /api/contact` (15 min cache) + admin `GET/PUT /api/admin/config/contact`, and a Contact tab in `/admin/configuration` (admin-only, same pattern as FAQ/About). `app/contact/page.tsx` is a server component reading the config, seeded with the #23/#24/#27 content. |
| 27 | Remove "rolling admissions" claims — applications are not rolling | **done (code) — live `config/teams` unverified** | From PM via Slack 2026-08-04. The contact page no longer says it (that copy moved into the contact config, whose seed omits it); no "rolling" string remains anywhere in `app/` or `components/`. **Still to check by hand: the live `config/teams` doc**, whose admin-editable text contained "rolling" — code cannot fix that, an admin edit must. |

## Internal code queue (not PM items)

- ~~Per-step stats~~ **done 2026-08-30 (PR #150)**: step rail + phase deep-dives on
  `/admin/stats`; `stats_snapshots/{step}` frozen on every forward transition; email
  owed-vs-sent coverage; signup-link warnings; close-sweep dry run. The dashboard/sweep/email
  predicates were extracted to shared modules so stats can never drift from them.
- ~~formData whitelist~~ **done 2026-08-05**: `sanitizeIncomingFormData` in `formAnswers.ts`,
  applied in the applicant PATCH route — junk keys can no longer be written.
- ~~FAQ/About/Teams/Contact server rendering~~ **done 2026-08-05**: all four public content
  pages now fetch config server-side; FAQ and Teams keep small client children for
  accordion/tabs. Content is in the initial HTML.
- ~~FAQ accordion animation~~ **done 2026-08-05**: grid-rows 0fr→1fr transition + chevron spin.
- ~~`POST /api/auth/session` invalid-token 500~~ **resolved 2026-08-05**: after restructuring
  the route with layered guards, prod returns the inner catch's proper 401 JSON — matching
  local behavior. Exact root cause of the old empty 500 never observed (no log access), but
  the failure mode is gone and every path now returns JSON even if a layer throws.

## Launch/ops board (as of 2026-08-04)

- **URGENT-BLOCKED: SES email env vars** — still only in Dhairya's old Vercel project; production
  email is a silent no-op until the 5 `AWS_SES_*`/`REPLY_TO_EMAIL` values are recovered and added.
  Must happen before his account deactivates. Also identify whose AWS account SES lives in.
- Smoke test on lhrrecruiting.org: sign-in + apply flow verified working (Gray, 2026-08-04).
- Firebase project ownership: recruiting gmail may NOT be Owner (shared account, org security
  call) — project remains under original owner's account; bus factor accepted for now.
- Name.com auto-renew: OFF by design — manual renewal each year, owner is aware.
- Google OAuth consent screen privacy URL: still to add (Google Cloud console → APIs & Services
  → OAuth consent screen / "Google Auth Platform → Branding" → Privacy policy link →
  `https://lhrrecruiting.org/privacy`).
- #2 data wipe: run after remaining schema-affecting changes; script with dry-run + backup.
- Gray's personal-gmail account promoted to admin (2026-08-04, script) for development.

## Post-PR-#10 chores

- `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` env vars are now unused — remove
  from Vercel and `.env` at convenience (plus the two legacy `GOOGLE_CALENDAR_*` vars never read).
  Confirmed 2026-08-30: nothing in `app/` or `lib/` reads a `GOOGLE_CALENDAR_*` var and
  `.env.example` never listed them, so the vars are dead — but two assignments survive in
  `scripts/qa/sandbox/serve.mjs` (`GOOGLE_CALENDAR_PRIVATE_KEY` / `_CLIENT_SECRET`, blanked for
  the hardened dev server). They are inert; drop those two lines as part of this chore. The
  `googleapis` dependency is likewise now unimported — drop it from `package.json` (and both
  lockfiles) at the same time.
- `tokens/google_calendar` doc and the `calendarSlotLocks` collection are orphaned — delete
  during the #2 wipe. Confirmed 2026-08-30: nothing in `app/` or `lib/` reads either; the only
  references left are in `scripts/wipe-cycle-data.mjs` (which deletes them) and the sandbox
  fingerprint.
- This file was deleted in PR #10 (`07f015d`, no stated reason) and restored — it is the working
  tracker + findings log; coordinate before removing.

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
- ~~**`PATCH /api/applications/[id]` accepts arbitrary `formData` keys**~~ — **fixed
  2026-08-05** by `sanitizeIncomingFormData()` (only the named fields and the two string bags
  survive; answers clipped to 20k chars, bags to 100 entries with 64-char keys). The junk keys
  already written before that (`__internal_override`, `role`, `z`, `dup`, `"  spaces  "`) are
  still in live data — reads must tolerate them.
- **The CSV export excludes `in_progress` for non-admins only** (`export-csv/route.ts`, the
  `role !== UserRole.ADMIN` status filter — line 115 as of 2026-08-30) even though staff can now
  see drafts on screen. Left deliberately — drafts are incomplete — but it means the export and
  the list can disagree on counts *for non-admin staff*; an admin's export does include drafts.
  Note the inline comment on that filter still says "same rule as list API", which is itself
  stale: the list API returns drafts to all staff (see the NOTE in `app/api/admin/applications/route.ts`).
- **Reviewers could not see phone numbers.** The application detail view rendered two
  hardcoded question labels that no longer matched the config, and skipped everything else.
  Now rendered from config (fixed under #21).

- ~~**`POST /api/auth/session` returns an empty 500 (instead of 401) for *invalid* ID tokens in
  production only** (2026-08-04)~~ — **resolved 2026-08-05**, see the internal code queue above.
- ~~**Public content pages (About, Teams, FAQ, Contact) are client components that fetch content
  after load**~~ — **fixed 2026-08-05**: all four are server components reading config, so the
  content is in the initial HTML. FAQ and Teams keep small client children for the
  accordion/tabs.

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
