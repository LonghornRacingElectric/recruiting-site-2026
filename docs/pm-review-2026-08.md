# Recruiting site — decisions needed before the final build

*Prepared 2026-08-05. Everything else on the change sheet is done and live at
lhrrecruiting.org. What remains is one big feature (the acceptance flow), two smaller items
waiting on your call, and the data wipe before launch. This doc collects every open question
in one place — each has lettered options and our recommendation, so you can answer with just
"1A, 2B, …" plus notes wherever you disagree.*

## Where things stand

Done and live: new domain, new hosting, question reordering + LinkedIn + OPS questions,
portfolio upload, resume 2-page limit, ranked-choice clarity, system-lead permissions,
edit-after-submit, in-progress visibility, team colors, FAQ page, config-driven contact page,
interview signup links (external calendar links replace in-app booking), auto-hide after
system pick, the close-interviews auto-reject, error monitoring, privacy/terms pages.

Remaining: the acceptance flow (below), rejection visibility, per-team email details, and the
pre-launch data wipe.

---

## 1–6 · The acceptance flow

Your original ask: *"applicant must accept their offer before next round moves or auto
rejected. if an applicant gets off of a waitlist but has alr accepted, they can reneg (this
will only happen on round 2), if they reneg, prev offer changes to rejected. also need some
logic between diff teams where if they accept an offer from another team it auto rejects from
others."*

Context: today an accepted applicant sees "Accepted" and has a separate Commit / Decline
choice with no deadline. Decisions release over three days (Day 1 → Day 2 → Day 3), and
admins advance those days manually.

**Q1. Should "accept your offer" replace the current Commit/Decline, or exist alongside it?**
- **A. Replace it — one button, one meaning.** Accepting = committing to that team/system. *(recommended — two accept-ish buttons will confuse applicants)*
- B. Keep both: accept first (holds your spot), commit later (final).

**Q2. What's the acceptance deadline?**
- **A. The next day-release: accepted on Day 1 → must accept before the admin advances to Day 2, and so on.** *(recommended — matches "before next round moves", and it's a deadline admins control)*
- B. A fixed time window (e.g. 48 hours) independent of the day releases.

**Q3. What happens to someone who doesn't accept in time?**
- **A. Auto-rejected from that team, exactly like your ask.** Their spot frees up for waitlist promotion. *(recommended)*
- B. Auto-rejected, but staff get a "pending expiry" list first so they can nudge people before the axe falls.

**Q4. Waitlist promotion mechanics — confirm our reading:** a staff member promotes someone
off the waitlist on Day 2/3; that creates a fresh offer with the same accept-or-lose rule,
deadline being the next day-release (Day 3 promotions: end of cycle).
- **A. Yes, that's the design.** *(recommended)*
- B. Different — explain.

**Q5. Reneging.** An applicant who accepted Team A, then gets promoted off Team B's waitlist
on round 2, may switch; Team A's acceptance flips to rejected.
- **A. As stated — and Team A's leads get an email that their acceptee reneged.** *(recommended — leads need to know a spot re-opened)*
- B. As stated, no notification.

**Q6. Cross-team exclusivity timing.** When an applicant accepts one team's offer, their
applications to the other teams auto-reject:
- **A. Immediately at accept.** Other teams see them drop out right away and can promote from their own waitlists sooner. *(recommended)*
- B. Only at end of cycle.

## 7–8 · Rejection visibility ("which systems on which teams")

Your ask: rejected applicants should show *which* systems on *which* teams rejected them, and
only read as fully rejected if they got in nowhere.

**Q7. Who is this view for?**
- **A. Staff only.** Reviewers/captains see the per-system, per-team breakdown; applicants keep seeing what they see today. *(recommended — small, safe, ships fast)*
- B. Applicants too — changes what rejection looks like on their dashboard and in emails, and requires reworking how/when rejections are revealed across teams. Meaningfully bigger and riskier.

**Q8. For "didn't get in anywhere": do waitlisted-elsewhere or declined-by-choice count as
still alive?**
- **A. Yes — someone waitlisted at another team is not "fully rejected"; someone who declined an offer chose that, so also not "rejected".** *(recommended)*
- B. No — anything that isn't an acceptance counts as rejected for the rollup.

## 9 · Per-team interview details in emails

Your ask: different emails per team because interview locations/times differ.

Since then, interview booking moved to per-system signup links that applicants open from the
portal — so the location/time details largely live in each system's external calendar page
now, not in our emails.

**Q9. What should the interview-offer email carry?**
- **A. Keep one shared email per trigger; add an optional per-team "interview details" blurb each team fills in (location, timing notes), inserted where relevant.** *(recommended — one template to maintain, covers the difference you described)*
- B. Three fully separate email templates per trigger (interview, trial, accepted, rejected, waitlisted × 3 teams = 15 templates to maintain).
- C. Nothing extra — the email just points to the portal, and the signup link + portal carry all details.

## 10–11 · Data wipe and launch timing

Everything applicant-side in the system is test data (~1,300 applications incl. 1,000
generated fakes, ~1,100 applicant accounts, test resumes/portfolios). Before the real cycle
we wipe it all; staff accounts and all configuration survive. We'll take a full backup and do
a dry-run listing first.

**Q10. Confirm wipe scope:** all applications + applicant accounts + uploaded files deleted;
staff accounts, questions, teams config, email templates, FAQ/contact/about content all kept.
- **A. Confirmed.** *(recommended)*
- B. Adjustments — say what to keep.

**Q11. When does the cycle open?** The wipe happens right before applications open, after all
the above is built. A target date drives our order of work — even a rough one helps.

---

## FYIs — no decision needed, but you should know

- **Single-offer no-shows are not auto-rejected anymore.** With booking now on external
  calendars, the site can't tell whether a single-offer applicant booked. The close-interviews
  auto-reject only catches multi-offer applicants who never picked a system; anyone else who
  ghosts must be manually marked No-show by staff. (Trade-off of the signup-link design.)
- **Each system lead must create their signup calendar and paste its link** into Admin →
  Configuration → Interviews *before* interviews release, or their applicants will see
  "config missing" instead of a booking link. Worth assigning with a deadline.
- **Privacy Policy and Terms are live** (lhrrecruiting.org/privacy, /terms). Please skim —
  especially the data-retention promise ("application data deleted after each cycle") and the
  "decisions are final/discretionary" language, since those speak for the org.
- The contact page now shows exactly the copy you specified and is editable in Admin →
  Configuration → Contact.
