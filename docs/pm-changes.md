# PM change requests — 2026 cycle

Source: PM's tracking sheet. Numbers are stable — use them in commits (`feat: … (#12)`) and
when updating the sheet. Status values: `todo`, `in progress`, `done`, `blocked`, `needs info`.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Question ordering — phone # can't be moved to top, should sit after name (list + order linked) | todo | The phone question *is* the `availability` question relabelled, pinned at index 4. `QuestionsTab.tsx` has no reorder control at all (imports `GripVertical` but never uses it). See findings below. |
| 2 | Wipe all applicant data, keep all reviewer data | todo | Destructive. 1306 applications live (1000 `isFakeData`, ~306 real — all org members testing, per Gray, so losing them is acceptable but avoid if easy). Needs a backup + a scoped script; run after schema changes land. |
| 3 | Light mode (mainly reviewer side) | **done (verify visually)** | Implemented: theme vars + `data-theme="light"` + ~250 lines of override CSS covering admin and public. See audit note below. |
| 4 | Update colors per team — hexcodes provided (electric, solar, IC) | **done** | PM hexes: Electric `#3B82F6` (Azure Blue), Solar `#FACC15` (Gold), Combustion `#FB7185` (Coral). Only Electric actually changed — the other two already matched. All team colouring now reads from `lib/teamColors.ts`. |
| 5 | Interview scheduler → interview config becomes a link input to a GCal signup entered per system lead; after picking a system, show that system's signup link + a "do not distribute" notice | todo | Replaces the current slot-reservation scheduler. Interacts with #6. |
| 6 | New step "interview start" — applicants must pick which system they interview for; auto-reject on no response | todo | New `RecruitingStep` + auto-reject job. Interacts with #5, #8, #15. |
| 7 | Update domain to say `lhr` not `lhre` | todo | Code defaults in `lib/models/EmailTemplate.ts` (4 links) + `lib/email/send.ts:113`. Saved templates in Firestore also need updating. |
| 8 | Acceptances — applicant must accept offer before next round or auto-reject; waitlist promotion allows reneging (round 2 only), prior offer flips to rejected; accepting another team's offer auto-rejects the rest | todo | Biggest item. Cross-team logic + new applicant-facing accept flow. |
| 9 | New optional question with larger file/page size for portfolio | todo | Resume upload today is PDF ≤5MB to Firebase Storage; portfolio needs its own limits. |
| 10 | Limit resume to 2 pages; add McCombs resume template link to the question | todo | Page count requires parsing the PDF client-side before upload. |
| 11 | Make ranked system order clearer to the applicant when selecting systems | todo | `app/apply/[team]/page.tsx` — `preferredSystems` array order is the ranking, but it isn't surfaced. |
| 12 | TCs/admins can accept to another system; system leads limited to their own system (route through TC) | todo | Role-scoped action + guard change. |
| 13 | "Edit application" button, hidden once applications close | **done** | Edit-in-place: a submitted application stays `submitted` while being edited (no risk of an applicant being silently left unsubmitted). Gated on `RecruitingStep.OPEN` in the API and the UI. Editing re-stamps `submittedAt` per PM's call — note autosave means that happens on every edit, not just on the button. |
| 14 | Reviewers *can't* see `in_progress` applications, only submitted | **done** | Read as a complaint, not a requirement (confirmed w/ Gray): she wants drafts visible. Staff list API no longer strips them; sidebar pre-selects every status except "In Progress", so drafts stay out of the default view and clearing filters shows everything. PM confirmed drafts must not be scorable: both scorecard POST routes reject `in_progress`, and the scorecard panel explains why instead of rendering the form. |
| 15 | Once an applicant picks their system, propagate to reviewers and auto-hide from systems they didn't pick | todo | Depends on #6. |
| 16 | On rejection, show which systems on which teams rejected; "fully rejected" only if rejected everywhere | todo | `rejectedBySystems` exists but is per-system, not per-team-per-system. |
| 17 | "Unreviewed by <system>" filter broken | todo | `ApplicationsSidebar.tsx:293-300` — treats "unreviewed" as "no offer/rejection from my system"; never consults scorecards. Need agreed semantics. |
| 18 | Show system rankings in the preferred-systems column and when accepting/rejecting | todo | Pairs with #11. |
| 19 | Trial workday email includes the system applied to | **done** | PM confirmed she just wants the invited-to system named, and it already was: live `trial_offered` template has `{{systemNames}}`, populated from `trialOffers`. Only fix needed was the empty-offer case, which rendered the literal word "General" (1 of 173 trial emails, 1 of 209 interview emails) — now falls back to `preferredSystems` and logs a warning. |
| 20 | FAQ page with admin-editable, reorderable questions | todo | New public page + config doc + `/admin/configuration` tab. Reuses the #1 reorder control. |
| 21 | Optional short answer for LinkedIn profile link | **done — pending visual check** | Admin-added common questions now persist (`formData.customAnswers`) and show up for reviewers + in the CSV. `linkedin` question added to the live config and to the code defaults. **TODO (Gray): confirm the field actually renders on the apply form** — server cache 10 min, browser `localStorage` cache 30 min, so hard-refresh first. |
| 22 | OPS dropdown with PR, CR, Treasury inputs (shown only if OPS selected) | todo | Conditional question support — check whether the question model handles conditional display. |

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
