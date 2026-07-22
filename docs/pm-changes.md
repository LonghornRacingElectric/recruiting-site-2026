# PM change requests — 2026 cycle

Source: PM's tracking sheet. Numbers are stable — use them in commits (`feat: … (#12)`) and
when updating the sheet. Status values: `todo`, `in progress`, `done`, `blocked`, `needs info`.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Question ordering — phone # can't be moved to top, should sit after name (list + order linked) | todo | `QuestionsTab.tsx` has no reorder control at all (imports `GripVertical` but never uses it). Order = array order. |
| 2 | Wipe all applicant data, keep all reviewer data | todo | Destructive. Needs a backup + a scoped script; run deliberately, ideally after schema changes land. |
| 3 | Light mode (mainly reviewer side) | **done (verify visually)** | Implemented: theme vars + `data-theme="light"` + ~250 lines of override CSS covering admin and public. See audit note below. |
| 4 | Update colors per team — hexcodes provided (electric, solar, IC) | **not done** | Vars exist but are unused; values are Tailwind defaults, not brand hexcodes. See audit note below. |
| 5 | Interview scheduler → interview config becomes a link input to a GCal signup entered per system lead; after picking a system, show that system's signup link + a "do not distribute" notice | todo | Replaces the current slot-reservation scheduler. Interacts with #6. |
| 6 | New step "interview start" — applicants must pick which system they interview for; auto-reject on no response | todo | New `RecruitingStep` + auto-reject job. Interacts with #5, #8, #15. |
| 7 | Update domain to say `lhr` not `lhre` | todo | Code defaults in `lib/models/EmailTemplate.ts` (4 links) + `lib/email/send.ts:113`. Saved templates in Firestore also need updating. |
| 8 | Acceptances — applicant must accept offer before next round or auto-reject; waitlist promotion allows reneging (round 2 only), prior offer flips to rejected; accepting another team's offer auto-rejects the rest | todo | Biggest item. Cross-team logic + new applicant-facing accept flow. |
| 9 | New optional question with larger file/page size for portfolio | todo | Resume upload today is PDF ≤5MB to Firebase Storage; portfolio needs its own limits. |
| 10 | Limit resume to 2 pages; add McCombs resume template link to the question | todo | Page count requires parsing the PDF client-side before upload. |
| 11 | Make ranked system order clearer to the applicant when selecting systems | todo | `app/apply/[team]/page.tsx` — `preferredSystems` array order is the ranking, but it isn't surfaced. |
| 12 | TCs/admins can accept to another system; system leads limited to their own system (route through TC) | todo | Role-scoped action + guard change. |
| 13 | "Edit application" button, hidden once applications close | todo | Gate on `RecruitingStep`. |
| 14 | Reviewers shouldn't see `in_progress` applications, only submitted | todo | Filter server-side, not just in the UI. |
| 15 | Once an applicant picks their system, propagate to reviewers and auto-hide from systems they didn't pick | todo | Depends on #6. |
| 16 | On rejection, show which systems on which teams rejected; "fully rejected" only if rejected everywhere | todo | `rejectedBySystems` exists but is per-system, not per-team-per-system. |
| 17 | "Unreviewed by <system>" filter broken | todo | `ApplicationsSidebar.tsx:293-300` — treats "unreviewed" as "no offer/rejection from my system"; never consults scorecards. Need agreed semantics. |
| 18 | Show system rankings in the preferred-systems column and when accepting/rejecting | todo | Pairs with #11. |
| 19 | Trial workday email includes the system applied to | todo | Add template variable + update default template. |
| 20 | FAQ page with admin-editable, reorderable questions | todo | New public page + config doc + `/admin/configuration` tab. Reuses the #1 reorder control. |
| 21 | Optional short answer for LinkedIn profile link | todo | May be pure config (add a question in the admin UI) rather than code. |
| 22 | OPS dropdown with PR, CR, Treasury inputs (shown only if OPS selected) | todo | Conditional question support — check whether the question model handles conditional display. |

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

### 4. Team colors — not actually done
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
