# Design: acceptance flow, rejection visibility, per-team emails

*Bundle implementing sheet items #8, #16, #25 per the PM's answers (Slack, 2026-08-04) to
`docs/pm-review-2026-08.md`. One branch (`feat/acceptance-bundle`), one PR, reviewed by
Celina. The pre-cycle wipe ran before this work, so application/user documents need **no
migrations** — only the surviving `config/email_templates` doc does.*

## PM decisions this implements

| Q | Decision |
|---|---|
| 1 | Accept/Decline is one-shot and final; UI says so. Replaces Commit/Decline (it *is* Commit/Decline, with a deadline). |
| 2 | Deadlines are the manual day-release advances: Day 1 out → advance = Day 1 locked + Day 2 out → … |
| 3 | Not accepted when the next advance happens → auto-rejected. |
| 4 | Waitlist promotion = staff accepts them on a later day; same accept-or-lose rule, deadline = next advance. |
| 5 | Reneging allowed (see below), no notifications to the jilted team. ⚠️ *PM flagged "maybe not this" — mechanics may change; build it isolated enough to disable.* |
| 6 | Accepting one team auto-rejects the user's other applications **at the next step advance**, not instantly. |
| 7 | Rejection breakdown is **staff-only**. |
| 8 | A waitlist elsewhere counts as "still alive" only for admins and the waitlisting team's staff. |
| 9 | Per-team email templates: each team customizes each trigger (3 × 5 = 15). |

---

## Part 1 — Acceptance flow (#8)

### Model

No new statuses. `COMMITTED` = accepted-and-final, `DECLINED` = declined-and-final, exactly as
today. The existing `commitment` field remains the record. Additions to `Application`:

```ts
// (implemented as one field covering both sweep causes)
autoRejected?: { reason: "offer_expired" | "committed_elsewhere"; at: Date };
renegedFrom?: string;    // team name of the acceptance this one replaced (audit only)
```

### Applicant flow

The dashboard's existing CommitmentPicker becomes the accept UI:
- Shown when a released offer exists (visible status ACCEPTED) and the user hasn't responded.
- Copy states plainly: **"This choice is final."** Accept → `COMMITTED`; Decline → `DECLINED`.
  The API rejects any second response (it already does — unchanged).
- Deadline messaging: "Respond before the next decision release or your offer is withdrawn."
  (We deliberately don't show a date — the PM advances steps manually.)

### The advance sweep

One new function, `sweepOnDecisionAdvance(newStep)`, called from the recruiting-step route on
any transition **into** `RELEASE_DECISIONS_DAY2` / `DAY3`, mirroring the close-interviews
sweep pattern (fires on the exact transition; noted in the step description):

1. **Expiry (Q3):** every application whose offer was *visible before this advance*
   (`trialDecision === 'advanced'` and `trialDecisionDay < day now entered`) and is still
   unresponded (status `ACCEPTED`, no commitment) → status `REJECTED`, `trialDecision:
   'rejected'`, `offerExpiredAt: now`. They'll receive the team's rejected email at the next
   trigger run — acceptable per PM's "auto rejection if not accepted on time".
2. **Cross-team (Q6):** for every user with a `COMMITTED` application, reject their *other*
   applications — **except** ones that are `WAITLISTED` (Q8 keeps those alive: they are the
   reneg pathway) or already terminal (rejected/declined).

Ordering: expiry first, then cross-team, one pass, idempotent (both skip already-terminal
apps). Cache invalidated after.

### Waitlist promotion (Q4)

No new mechanism needed: staff accept a waitlisted applicant on Day 2/3 exactly as they accept
anyone (status → ACCEPTED, `trialDecisionDay` = current day per existing logic). The offer
becomes visible immediately (their day has already released) and the same expiry rule applies
at the next advance.

### Reneging (Q5) — isolated module

Gate: allowed only when `currentStep >= RELEASE_DECISIONS_DAY2` ("round 2"). In the commit
endpoint: if the user already has a `COMMITTED` application on another team and accepts a
newly released offer:
- new application → `COMMITTED` (with `renegedFrom: <old team>`)
- old application → `REJECTED` (per the sheet: "prev offer changes to rejected"), commitment
  cleared into an audit subfield
- no notifications (Q5B)
- applicant-side UI shows an explicit warning: "Accepting this offer withdraws your accepted
  offer with <team> — this cannot be undone."

All reneg logic lives behind one guard function so it can be disabled with a single flag if
the PM cuts it. It is the only path that ever un-finalizes a COMMITTED application.

---

## Part 2 — Rejection visibility, staff-only (#16)

- `/api/admin/applications/[id]/related` and `batchGetOtherTeamApplications` additionally
  return `rejectedBySystems` and `trialDecision` per related application.
- **Admin detail:** the "Also applied to" chips gain status detail — e.g. `Solar — rejected
  (Power Systems, Powertrain)` — and the header shows a rollup badge: **"Rejected everywhere"**
  only when *every* application the user has is terminally rejected; otherwise **"Rejected
  here — active at <teams>"**.
- **Q8 masking rule**, applied server-side in those two endpoints: a related application that
  is WAITLISTED renders as waitlisted-alive only if the viewer is an admin, or staff of that
  application's team (leads/reviewers additionally matched on system). Everyone else sees it
  as "no longer active" — indistinguishable from rejected. Self-declined shows as "declined"
  to everyone (it's the applicant's own choice; not sensitive).
- No applicant-facing changes of any kind (Q7A).

## Part 3 — Per-team email templates (#25)

- `EmailTemplatesConfig` becomes `{ globalEnabled, teams: { [team]: EmailTemplate[] } }`.
- **Legacy upgrade on read:** `config/email_templates` survived the wipe in the old flat
  shape. `getEmailTemplatesConfig()` detects it and expands the 5 shared templates into
  identical sets for all 3 teams; first admin save writes the new shape. No script needed.
- `sendStatusEmail` selects `teams[app.team]` for the trigger; if that team's template is
  missing or disabled, the email is skipped and a warning logged (no silent cross-team
  fallback — the PM wants per-team voice).
- **Emails admin tab** gains a team selector (Electric / Solar / Combustion) above the
  existing per-trigger editor; test-send works per team. 15 templates total, seeded equal.

---

## Explicitly out of scope

- Any applicant-visible rejection breakdown (Q7).
- Notifications on reneg (Q5B) — the existing lead notification on *first* accept/decline
  stays as-is.
- Automatic waitlist promotion — staff-driven, as today.
- New email triggers (expiry uses the team's existing `rejected` template).

## Risks / review focus

- The advance sweep is the highest-blast-radius piece: it must be idempotent and must never
  touch WAITLISTED or terminal applications. Test matrix: unresponded day-1 offer at day-2
  advance (expires) · responded (untouched) · waitlisted at other team (survives) · committed
  user's other in-flight app (rejected at advance) · double-advance (no double effects).
- Reneg interacts with the cross-team sweep: a reneged-into commitment must not cause the
  sweep to re-reject anything already handled. Covered by terminal-status skips.
- Email selection changes for every send — verify each trigger against each team once.

## Commit plan

1. `feat: per-team email templates (#25)` — model, legacy upgrade, send selection, admin tab
2. `feat: offer expiry and cross-team sweep on decision advances (#8)`
3. `feat: reneg path behind round-2 gate (#8)`
4. `feat: applicant accept/decline finality UI (#8)`
5. `feat: staff rejection breakdown with waitlist masking (#16)`
6. `docs: tracker updates`
