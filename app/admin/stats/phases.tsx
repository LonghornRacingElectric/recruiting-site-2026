"use client";

import { useState } from "react";
import clsx from "clsx";
import { downloadCsv } from "@/lib/utils/downloadFile";
import { Team } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { STEP_ORDER } from "@/lib/utils/statusUtils";
import { getTeamColor } from "@/lib/teamColors";
import type { EmailTrigger } from "@/lib/models/EmailTemplate";
import type { RecruitingStats, StatsSnapshot, Tally } from "@/lib/firebase/stats";
import { Bar, Card, ExportButton, fmtInt, GOLD, pct, Segmented, Tile } from "./atoms";

// ---------------------------------------------------------------------------
// The per-step deep dive: a rail over the whole pipeline, and a phase panel
// group per step. A past step renders from its frozen snapshot (captured by
// the step-change route the moment the step ended); the current and future
// steps render live numbers.
// ---------------------------------------------------------------------------

const TEAMS: Team[] = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];

/** Everything the phase panels need — RecruitingStats or a snapshot of one. */
export type PhaseData = Omit<RecruitingStats, "series">;

export const STEP_LABELS: Record<RecruitingStep, string> = {
  [RecruitingStep.PRE_OPEN]: "Pre-open",
  [RecruitingStep.OPEN]: "Open",
  [RecruitingStep.REVIEWING]: "Reviewing",
  [RecruitingStep.RELEASE_INTERVIEWS]: "Interviews out",
  [RecruitingStep.INTERVIEWING]: "Interviewing",
  [RecruitingStep.CLOSE_INTERVIEWS]: "Interviews close",
  [RecruitingStep.RELEASE_TRIAL]: "Trials out",
  [RecruitingStep.TRIAL_WORKDAY]: "Trial workday",
  [RecruitingStep.RELEASE_DECISIONS_DAY1]: "Decisions D1",
  [RecruitingStep.RELEASE_DECISIONS_DAY2]: "Decisions D2",
  [RecruitingStep.RELEASE_DECISIONS_DAY3]: "Decisions D3",
};

type PhaseGroup = "review" | "interviews" | "trial" | "decisions";

const STEP_GROUP: Record<RecruitingStep, PhaseGroup> = {
  [RecruitingStep.PRE_OPEN]: "review",
  [RecruitingStep.OPEN]: "review",
  [RecruitingStep.REVIEWING]: "review",
  [RecruitingStep.RELEASE_INTERVIEWS]: "interviews",
  [RecruitingStep.INTERVIEWING]: "interviews",
  [RecruitingStep.CLOSE_INTERVIEWS]: "interviews",
  [RecruitingStep.RELEASE_TRIAL]: "trial",
  [RecruitingStep.TRIAL_WORKDAY]: "trial",
  [RecruitingStep.RELEASE_DECISIONS_DAY1]: "decisions",
  [RecruitingStep.RELEASE_DECISIONS_DAY2]: "decisions",
  [RecruitingStep.RELEASE_DECISIONS_DAY3]: "decisions",
};

const TRIGGER_LABELS: Record<EmailTrigger, string> = {
  interview_offered: "Interview offer",
  trial_offered: "Trial offer",
  accepted: "Acceptance",
  rejected: "Rejection",
  waitlisted: "Waitlist",
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// ---------------------------------------------------------------------------
// Step rail
// ---------------------------------------------------------------------------

export function StepRail({ current, selected, snapshots, onSelect }: {
  current: RecruitingStep;
  selected: RecruitingStep;
  snapshots: StatsSnapshot[];
  onSelect: (s: RecruitingStep) => void;
}) {
  const currentIdx = STEP_ORDER.indexOf(current);
  const snapFor = (s: RecruitingStep) => snapshots.find((x) => x.snapshotStep === s);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-stretch gap-1.5 min-w-max py-1">
        {STEP_ORDER.map((s, i) => {
          const isCurrent = s === current;
          const isSelected = s === selected;
          const isPast = i < currentIdx;
          const snap = snapFor(s);
          return (
            <button key={s} onClick={() => onSelect(s)}
              className={clsx(
                "relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors min-w-[92px]",
                isSelected ? "border-white/30 bg-white/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]",
              )}>
              <span className="flex items-center gap-1.5">
                <i className={clsx("inline-block w-1.5 h-1.5 rounded-full",
                  isCurrent ? "" : isPast ? "bg-white/40" : "bg-white/15")}
                  style={isCurrent ? { background: GOLD } : undefined} />
                <span className={clsx("text-[12px] font-semibold whitespace-nowrap", isCurrent ? "text-white" : isPast ? "text-white/70" : "text-white/40")}>
                  {STEP_LABELS[s]}
                </span>
              </span>
              <span className="text-[10px] text-white/30 whitespace-nowrap">
                {isCurrent ? "now" : snap ? `ended ${fmtWhen(snap.capturedAt)}` : isPast ? "no snapshot" : "upcoming"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function TeamDots({ tally }: { tally: Tally }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[11px] text-white/60 tabular-nums">
      {TEAMS.map((t) => (
        <span key={t} className="inline-flex items-center gap-1" title={t}>
          <i className="inline-block w-2 h-2 rounded-sm" style={{ background: getTeamColor(t) }} />
          {fmtInt(tally.byTeam[t])}
        </span>
      ))}
    </span>
  );
}

function TallyTile({ tally, label, sub, tone }: { tally: Tally; label: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className={clsx("rounded-xl border px-4 py-3.5",
      tone === "warn" && tally.total > 0 ? "border-amber-400/25 bg-amber-400/[0.06]" : tone === "good" ? "border-emerald-400/20 bg-emerald-400/[0.05]" : "border-white/10 bg-white/[0.04]")}>
      <div className={clsx("text-[26px] font-bold tracking-tight tabular-nums leading-none", tone === "warn" && tally.total > 0 ? "text-amber-300" : "text-white")}>{fmtInt(tally.total)}</div>
      <div className="text-[12px] text-white/60 mt-1.5">{label}</div>
      <div className="mt-1.5"><TeamDots tally={tally} /></div>
      {sub && <div className="text-[11px] text-white/35 mt-1">{sub}</div>}
    </div>
  );
}

function Th({ children, first }: { children?: React.ReactNode; first?: boolean }) {
  return <th className={clsx("font-semibold py-2 px-3 whitespace-nowrap", first ? "text-left pl-0" : "text-right")}>{children}</th>;
}

function Td({ children, first, dim, strong }: { children: React.ReactNode; first?: boolean; dim?: boolean; strong?: boolean }) {
  return (
    <td className={clsx("py-2.5 px-3", first ? "text-left pl-0 font-semibold text-white whitespace-nowrap" : "text-right",
      !first && (dim ? "text-white/20" : strong ? "text-white font-semibold" : "text-white/80"))}>
      {children}
    </td>
  );
}

function EmailCoverage({ data, triggers }: { data: PhaseData; triggers: EmailTrigger[] }) {
  const rows = data.emails.rows.filter((r) => triggers.includes(r.trigger));
  const byTrigger = triggers.map((trigger) => {
    const cells = TEAMS.map((team) => rows.find((r) => r.trigger === trigger && r.team === team) || { trigger, team, eligible: 0, sent: 0 });
    const eligible = cells.reduce((a, c) => a + c.eligible, 0);
    const sent = cells.reduce((a, c) => a + c.sent, 0);
    return { trigger, cells, eligible, sent, unsent: eligible - sent };
  });
  const anyUnsent = byTrigger.some((r) => r.unsent > 0);
  return (
    <Card title="Email coverage" right={<span className="text-[11px] text-white/35">owed at this step (visible status) vs recorded as sent</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-white/40 text-[11px] uppercase tracking-wider">
              <Th first>Email</Th>
              {TEAMS.map((t) => <Th key={t}>{t}</Th>)}
              <Th>Sent / owed</Th>
              <Th>Unsent</Th>
            </tr>
          </thead>
          <tbody>
            {byTrigger.map((r) => (
              <tr key={r.trigger} className="border-t border-white/5">
                <Td first>{TRIGGER_LABELS[r.trigger]}</Td>
                {r.cells.map((c) => (
                  <Td key={c.team} dim={c.eligible === 0}>{fmtInt(c.sent)} / {fmtInt(c.eligible)}</Td>
                ))}
                <Td strong>{fmtInt(r.sent)} / {fmtInt(r.eligible)}</Td>
                <td className={clsx("py-2.5 px-3 text-right font-semibold", r.unsent > 0 ? "text-amber-300" : "text-white/20")}>{fmtInt(r.unsent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-white/30 mt-3">
        {anyUnsent
          ? "Unsent > 0 means applicants are owed an email at the current step — run Send Emails in Admin → Settings, or expect it if the release hasn't been sent yet."
          : "Everyone owed one of these emails at the current step has it recorded."}
        {" "}Same trigger derivation as the send job (visible status, never the raw one).
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Phase panels
// ---------------------------------------------------------------------------

function ReviewPanel({ data }: { data: PhaseData }) {
  const [team, setTeam] = useState<Team>(Team.ELECTRIC);
  const rows = data.review.bySystem[team];
  const max = Math.max(1, ...rows.map((r) => r.review + r.decision));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TallyTile tally={data.review.pendingReview} label="Awaiting first review" sub="submitted, no review decision" tone="warn" />
        <TallyTile tally={data.review.unranked} label="Submitted with no ranking" sub="invisible to every lead's queue — captains only (#131)" tone="warn" />
        <TallyTile tally={data.interviews.atInterview} label="Advanced to interview" />
        <Tile value={fmtInt(data.applications.byStatus.rejected)} label="Rejected so far" sub="internal status — releases mask it" />
      </div>
      <Card title="Still waiting on each system" right={
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented value={team} onChange={setTeam} options={TEAMS.map((t) => ({ value: t, label: t }))} />
          <ExportButton onClick={() => downloadCsv(`pending-by-system-${team.toLowerCase()}.csv`, [["system", "review pending", "decision pending"], ...rows.map((r) => [r.system, r.review, r.decision])])} />
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                <Th first>System</Th><Th>Review pending</Th><Th>Decision pending</Th>
                <th className="text-left font-semibold py-2 pl-4 w-40">Load</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.system} className="border-t border-white/5">
                  <Td first>{r.system}</Td>
                  <Td dim={r.review === 0} strong={r.review > 0}>{fmtInt(r.review)}</Td>
                  <Td dim={r.decision === 0}>{fmtInt(r.decision)}</Td>
                  <td className="pl-4"><Bar value={r.review + r.decision} max={max} color={getTeamColor(team)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-white/30 mt-3">Per ranked (application, system) pair — the same predicate the admin dashboard's pending counts use, so this always matches what each lead sees.</p>
      </Card>
    </>
  );
}

function InterviewsPanel({ data }: { data: PhaseData }) {
  const [team, setTeam] = useState<Team>(Team.ELECTRIC);
  const iv = data.interviews;
  const sysRows = data.systems[team].filter((r) => r.interviewOffers > 0);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <TallyTile tally={iv.atInterview} label="At interview stage" />
        <TallyTile tally={iv.picked} label="Picked their system" tone="good" sub="one-way pick made" />
        <TallyTile tally={iv.awaitingPick} label="Awaiting pick" tone="warn" sub="multiple live offers, no pick yet" />
        <TallyTile tally={iv.singleLive} label="Single live offer" sub="no picker — staff mark completed / no-show" />
        <TallyTile tally={iv.sweepPreview} label="Close sweep would reject" tone="warn" sub="same predicate the CLOSE_INTERVIEWS sweep runs" />
      </div>

      {iv.signupLinks.missing.length > 0 && (
        <Card title="Signup links missing" className="border-amber-400/25 bg-amber-400/[0.04]">
          <p className="text-[13px] text-amber-200/90 mb-2">
            {iv.signupLinks.missing.length} system{iv.signupLinks.missing.length === 1 ? " has" : "s have"} live interview offers but no signup link in the interview config — applicants there can see an offer but can&apos;t book:
          </p>
          <div className="flex flex-wrap gap-2">
            {iv.signupLinks.missing.map((m) => (
              <span key={`${m.team}|${m.system}`} className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/25 px-2 py-1 text-[12px] text-amber-100">
                <i className="inline-block w-2 h-2 rounded-sm" style={{ background: getTeamColor(m.team) }} />{m.system}
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Offers by team">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                  <Th first>Team</Th><Th>Pending</Th><Th>Completed</Th><Th>No-show</Th><Th>Cancelled</Th><Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {TEAMS.map((t) => {
                  const o = iv.offersByTeam[t];
                  return (
                    <tr key={t} className="border-t border-white/5">
                      <td className="py-2.5 pl-0 pr-3 font-semibold text-white"><span className="flex items-center gap-2"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: getTeamColor(t) }} />{t}</span></td>
                      <Td dim={o.pending === 0} strong={o.pending > 0}>{fmtInt(o.pending)}</Td>
                      <Td dim={o.completed === 0}>{fmtInt(o.completed)}</Td>
                      <Td dim={o.noShow === 0}>{fmtInt(o.noShow)}</Td>
                      <Td dim={o.cancelled === 0}>{fmtInt(o.cancelled)}</Td>
                      <Td strong>{fmtInt(o.total)}</Td>
                    </tr>
                  );
                })}
                <tr className="border-t border-white/10">
                  <Td first>All</Td>
                  <Td strong>{fmtInt(iv.offers.pending)}</Td>
                  <Td strong>{fmtInt(iv.offers.completed)}</Td>
                  <Td strong>{fmtInt(iv.offers.noShow)}</Td>
                  <Td strong>{fmtInt(iv.offers.cancelled)}</Td>
                  <Td strong>{fmtInt(iv.offers.total)}</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-white/30 mt-3">
            Signup links: {fmtInt(iv.signupLinks.withLink)} of {fmtInt(iv.signupLinks.needed)} systems with live offers have one configured.
            Booking happens on external links, so completed / no-show are staff-marked.
          </p>
        </Card>

        <Card title="Offers by system" right={
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented value={team} onChange={setTeam} options={TEAMS.map((t) => ({ value: t, label: t }))} />
            <ExportButton onClick={() => downloadCsv(`interview-offers-${team.toLowerCase()}.csv`, [["system", "offers", "pending", "completed", "no-show", "cancelled", "picked by"], ...sysRows.map((r) => [r.system, r.interviewOffers, r.intPending, r.intCompleted, r.intNoShow, r.intCancelled, r.picked])])} />
          </div>
        }>
          {sysRows.length === 0 ? <p className="text-[12px] text-white/30">No interview offers on this team yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                    <Th first>System</Th><Th>Offers</Th><Th>Pending</Th><Th>Done</Th><Th>No-show</Th><Th>Cancelled</Th><Th>Picked by</Th>
                  </tr>
                </thead>
                <tbody>
                  {sysRows.map((r) => (
                    <tr key={r.system} className="border-t border-white/5">
                      <Td first>{r.system}</Td>
                      <Td strong>{fmtInt(r.interviewOffers)}</Td>
                      <Td dim={r.intPending === 0}>{fmtInt(r.intPending)}</Td>
                      <Td dim={r.intCompleted === 0}>{fmtInt(r.intCompleted)}</Td>
                      <Td dim={r.intNoShow === 0}>{fmtInt(r.intNoShow)}</Td>
                      <Td dim={r.intCancelled === 0}>{fmtInt(r.intCancelled)}</Td>
                      <Td dim={r.picked === 0} strong={r.picked > 0}>{fmtInt(r.picked)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-white/30 mt-3">&ldquo;Picked by&rdquo; counts one-way picks that landed on this system, whatever stage those applicants are at now.</p>
        </Card>
      </div>

      <EmailCoverage data={data} triggers={["interview_offered", "rejected"]} />
    </>
  );
}

function TrialPanel({ data }: { data: PhaseData }) {
  const dc = data.decisions;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TallyTile tally={dc.trialOffers} label="Trial offers extended" sub="offer count, not applicants" />
        <TallyTile tally={dc.trialDecisions.advanced} label="Advanced (accept coming)" tone="good" />
        <TallyTile tally={dc.trialDecisions.waitlisted} label="Waitlist decisions" />
        <TallyTile tally={dc.trialDecisions.rejected} label="Trial-stage rejections" sub="masked until their decision day" />
      </div>
      <EmailCoverage data={data} triggers={["trial_offered", "rejected"]} />
    </>
  );
}

function DecisionsPanel({ data }: { data: PhaseData }) {
  const dc = data.decisions;
  const days = ["1", "2", "3"] as const;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <TallyTile tally={dc.committed} label="Committed" tone="good" />
        <TallyTile tally={dc.awaitingResponse} label="Offer out, awaiting response" tone="warn" sub="unanswered offers expire at the next advance" />
        <TallyTile tally={dc.declined} label="Declined" />
        <TallyTile tally={dc.waitlisted} label="On the waitlist" sub="the reneg / promotion pathway" />
        <Tile value={fmtInt(dc.reneged)} label="Renegs" sub={`auto-rejected: ${fmtInt(dc.autoRejected.offerExpired)} expired · ${fmtInt(dc.autoRejected.committedElsewhere)} committed elsewhere`} />
      </div>

      <Card title="Final offers by release day">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                <Th first>Day</Th><Th>Offers</Th><Th>Committed</Th><Th>Declined</Th><Th>Awaiting</Th><Th>Expired</Th><Th>Commit rate</Th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const r = dc.byDay[d];
                const resolved = r.committed + r.declined + r.expired;
                return (
                  <tr key={d} className="border-t border-white/5">
                    <Td first>Day {d}</Td>
                    <Td strong>{fmtInt(r.decided)}</Td>
                    <Td dim={r.committed === 0} strong={r.committed > 0}>{fmtInt(r.committed)}</Td>
                    <Td dim={r.declined === 0}>{fmtInt(r.declined)}</Td>
                    <td className={clsx("py-2.5 px-3 text-right", r.awaiting > 0 ? "text-amber-300 font-semibold" : "text-white/20")}>{fmtInt(r.awaiting)}</td>
                    <Td dim={r.expired === 0}>{fmtInt(r.expired)}</Td>
                    <Td dim={resolved === 0}>{pct(r.committed, resolved)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-white/30 mt-3">
          An offer counts on the day it was stamped for, which is also the day the applicant first sees it. Day 2/3 offers stamped early sit in &ldquo;Awaiting&rdquo; until their own release day. Commit rate is committed ÷ resolved (committed + declined + expired).
        </p>
      </Card>

      <EmailCoverage data={data} triggers={["accepted", "waitlisted", "rejected"]} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper: picks panel group + data source (live vs snapshot)
// ---------------------------------------------------------------------------

export function PhaseSection({ step, currentStep, live, snapshot }: {
  step: RecruitingStep;
  currentStep: RecruitingStep;
  live: RecruitingStats;
  snapshot?: StatsSnapshot;
}) {
  const idx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const isPast = idx < currentIdx;
  const data: PhaseData = isPast && snapshot ? snapshot : live;
  const group = STEP_GROUP[step];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold text-white">{STEP_LABELS[step]}</h2>
        {isPast && snapshot && (
          <span className="text-[11px] rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/50">
            Frozen as this step ended — {STEP_LABELS[snapshot.snapshotStep]} → {STEP_LABELS[snapshot.nextStep]}, {fmtWhen(snapshot.capturedAt)}
          </span>
        )}
        {isPast && !snapshot && (
          <span className="text-[11px] rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2 py-1 text-amber-200/90">
            No snapshot was captured for this step — showing live numbers instead
          </span>
        )}
        {idx > currentIdx && (
          <span className="text-[11px] rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/50">
            Not reached yet — live numbers as a preview
          </span>
        )}
      </div>
      {group === "review" && <ReviewPanel data={data} />}
      {group === "interviews" && <InterviewsPanel data={data} />}
      {group === "trial" && <TrialPanel data={data} />}
      {group === "decisions" && <DecisionsPanel data={data} />}
    </div>
  );
}
