"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { useStats } from "@/hooks/useStats";
import { Team } from "@/lib/models/User";
import { ApplicationStatus } from "@/lib/models/Application";
import { getTeamColor } from "@/lib/teamColors";
import type { RecruitingStats, SystemDemand } from "@/lib/firebase/stats";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAMS: Team[] = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];

const STATUS_ORDER: ApplicationStatus[] = [
  ApplicationStatus.IN_PROGRESS,
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.TRIAL,
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.COMMITTED,
  ApplicationStatus.DECLINED,
  ApplicationStatus.REJECTED,
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.IN_PROGRESS]: "In progress",
  [ApplicationStatus.SUBMITTED]: "Submitted",
  [ApplicationStatus.INTERVIEW]: "Interview",
  [ApplicationStatus.TRIAL]: "Trial",
  [ApplicationStatus.ACCEPTED]: "Accepted",
  [ApplicationStatus.WAITLISTED]: "Waitlisted",
  [ApplicationStatus.COMMITTED]: "Committed",
  [ApplicationStatus.DECLINED]: "Declined",
  [ApplicationStatus.REJECTED]: "Rejected",
};

const GOLD = "var(--lhr-gold)";

type Metric = "submitted" | "created" | "accounts";
type Mode = "cumulative" | "per-bucket";
type Range = "24h" | "7d" | "all";
type BucketMinutes = 15 | 60 | 1440;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtTick(ms: number, bucket: BucketMinutes): string {
  const d = new Date(ms);
  if (bucket === 1440) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric" });
}

function fmtWhen(ms: number, bucket: BucketMinutes): string {
  const d = new Date(ms);
  if (bucket === 1440) return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Series building (client-side re-bucketing of the sparse 15-minute points)
// ---------------------------------------------------------------------------

interface Row { t: number; total: number; byTeam: Record<Team, number> }

function buildRows(stats: RecruitingStats, metric: Metric, mode: Mode, bucket: BucketMinutes, range: Range): Row[] {
  const from = new Date(stats.series.from).getTime();
  const to = new Date(stats.series.to).getTime();
  const bucketMs = bucket * 60e3;
  const key = (ms: number) => (bucket === 1440 ? startOfLocalDay(ms) : Math.floor(ms / bucketMs) * bucketMs);
  const next = (k: number) => (bucket === 1440 ? startOfLocalDay(k + 36 * 3600e3) : k + bucketMs);

  const grid = new Map<number, Row>();
  for (let k = key(from); k <= key(to); k = next(k)) {
    grid.set(k, { t: k, total: 0, byTeam: { [Team.ELECTRIC]: 0, [Team.SOLAR]: 0, [Team.COMBUSTION]: 0 } });
  }
  for (const p of stats.series.points) {
    const row = grid.get(key(new Date(p.t).getTime()));
    if (!row) continue;
    if (metric === "accounts") { row.total += p.accounts; continue; }
    for (const team of TEAMS) { const v = p[metric][team] || 0; row.byTeam[team] += v; row.total += v; }
  }
  let rows = [...grid.values()];
  if (mode === "cumulative") {
    let total = 0; const acc: Record<Team, number> = { [Team.ELECTRIC]: 0, [Team.SOLAR]: 0, [Team.COMBUSTION]: 0 };
    rows = rows.map((r) => {
      total += r.total;
      for (const team of TEAMS) acc[team] += r.byTeam[team];
      return { t: r.t, total, byTeam: { ...acc } };
    });
  }
  const now = to;
  const start = range === "24h" ? now - 24 * 3600e3 : range === "7d" ? now - 7 * 24 * 3600e3 : -Infinity;
  return rows.filter((r) => r.t >= key(Math.max(start, from)));
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface Series { key: string; label: string; color: string; dash?: string; value: (r: Row) => number }

function TimeChart({ rows, series, kind, bucket }: { rows: Row[]; series: Series[]; kind: "line" | "bar"; bucket: BucketMinutes }) {
  const W = 960, H = 300, ML = 44, MR = 70, MT = 16, MB = 34;
  const IW = W - ML - MR, IH = H - MT - MB;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const n = rows.length;
  const maxRaw = Math.max(1, ...rows.map((r) => (kind === "bar" ? series.reduce((a, s) => a + s.value(r), 0) : Math.max(...series.map((s) => s.value(r))))));
  const step = niceStep(maxRaw);
  const ymax = Math.ceil(maxRaw / step) * step;
  const X = (i: number) => ML + (n <= 1 ? IW / 2 : (i * IW) / (n - 1));
  const XB = (i: number) => ML + ((i + 0.5) * IW) / Math.max(1, n);
  const Y = (v: number) => MT + IH - (v / ymax) * IH;
  const tickEvery = Math.max(1, Math.ceil(n / 8));

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, kind === "bar" ? Math.floor(frac * n) : Math.round(frac * (n - 1))));
    const wrap = wrapRef.current?.getBoundingClientRect();
    setHover({ i, x: e.clientX - (wrap?.left ?? 0), y: e.clientY - (wrap?.top ?? 0) });
  };

  if (n === 0) return <div className="h-40 flex items-center justify-center text-[13px] text-white/30">No data in this range.</div>;

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none">
        {/* grid + y labels */}
        {Array.from({ length: Math.round(ymax / step) + 1 }, (_, k) => k * step).map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={Y(v)} y2={Y(v)} stroke="currentColor" className="text-white/10" strokeWidth={1} />
            <text x={ML - 8} y={Y(v) + 4} textAnchor="end" fill="currentColor" className="text-white/35" fontSize={11}>{fmtInt(v)}</text>
          </g>
        ))}
        {/* x labels */}
        {rows.map((r, i) => (i % tickEvery === 0 || i === n - 1) && (i === n - 1 ? (n - 1) % tickEvery > tickEvery / 2 || n - 1 === 0 : true) ? (
          <text key={r.t} x={kind === "bar" ? XB(i) : X(i)} y={H - 10} textAnchor="middle" fill="currentColor" className="text-white/35" fontSize={11}>{fmtTick(r.t, bucket)}</text>
        ) : null)}

        {kind === "bar" ? (
          rows.map((r, i) => {
            const bw = Math.max(2, IW / n - 2);
            let acc = 0; const total = series.reduce((a, s) => a + s.value(r), 0);
            return (
              <g key={r.t}>
                {series.map((s) => {
                  const v = s.value(r); if (!v) return null;
                  const y0 = Y(acc), y1 = Y(acc + v); acc += v;
                  const isTop = acc === total; const h = Math.max(1, y0 - y1 - (acc - v > 0 ? 1 : 0));
                  const x = XB(i) - bw / 2; const rr = isTop ? Math.min(3, bw / 2, h) : 0;
                  return <path key={s.key} d={`M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + bw - rr} Q${x + bw},${y1} ${x + bw},${y1 + rr} V${y0} Z`} fill={s.color} />;
                })}
              </g>
            );
          })
        ) : (
          series.map((s) => (
            <g key={s.key}>
              <path d={rows.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(s.value(r)).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />
              <circle cx={W - MR + 6} cy={Y(s.value(rows[n - 1]))} r={3.5} fill={s.color} />
              <text x={W - MR + 14} y={Y(s.value(rows[n - 1])) + 4} fill="currentColor" className="text-white/80" fontSize={11} fontWeight={600}>{fmtInt(s.value(rows[n - 1]))}</text>
            </g>
          ))
        )}

        {hover && kind === "line" && <line x1={X(hover.i)} x2={X(hover.i)} y1={MT} y2={MT + IH} stroke="currentColor" className="text-white/30" strokeDasharray="2 3" />}
        <rect x={ML} y={MT} width={IW} height={IH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="absolute pointer-events-none z-10 rounded-lg border border-white/10 bg-[#0c1218] px-3 py-2 text-[12px] shadow-xl min-w-[170px]"
          style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 400) - 190), top: hover.y + 14 }}>
          <div className="font-semibold text-white mb-1">{fmtWhen(rows[hover.i].t, bucket)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 text-white/70">
              <span className="flex items-center gap-1.5"><i className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
              <b className="text-white tabular-nums">{fmtInt(s.value(rows[hover.i]))}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return Math.max(1, nice * mag); // counts: never a fractional gridline
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} disabled={o.disabled} onClick={() => onChange(o.value)}
          className={clsx("px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors",
            o.value === value ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80",
            o.disabled && "opacity-30 cursor-not-allowed")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, right, children, className }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-white/10 bg-white/[0.04] p-5", className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          {title && <h2 className="text-[14px] font-semibold text-white">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
      <div className="text-[26px] font-bold text-white tracking-tight tabular-nums leading-none">{value}</div>
      <div className="text-[12px] text-white/60 mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-white/35 mt-0.5">{sub}</div>}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-white/10 text-[12px] font-semibold text-white/50 hover:text-white hover:bg-white/5">
      <Download className="h-3 w-3" /> CSV
    </button>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/5 w-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (100 * value) / max : 0}%`, background: color }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function StatsView() {
  const { stats, error, isLoading, refreshing, refresh } = useStats();

  const [metric, setMetric] = useState<Metric>("submitted");
  const [mode, setMode] = useState<Mode>("cumulative");
  const [bucket, setBucket] = useState<BucketMinutes>(60);
  const [range, setRange] = useState<Range>("all");
  const [split, setSplit] = useState(true);

  const [sysTeam, setSysTeam] = useState<Team>(Team.ELECTRIC);
  const [sysSort, setSysSort] = useState<{ key: keyof SystemDemand; dir: "asc" | "desc" }>({ key: "any", dir: "desc" });

  const rows = useMemo(() => (stats ? buildRows(stats, metric, mode, bucket, range) : []), [stats, metric, mode, bucket, range]);

  const series: Series[] = useMemo(() => {
    if (metric === "accounts") return [{ key: "accounts", label: "Applicant accounts", color: GOLD, value: (r) => r.total }];
    if (split) return TEAMS.map((t) => ({ key: t, label: t, color: getTeamColor(t), value: (r) => r.byTeam[t] }));
    return [{ key: "total", label: metric === "submitted" ? "Submitted" : "Started", color: GOLD, value: (r) => r.total }];
  }, [metric, split]);

  const systemRows = useMemo(() => {
    if (!stats) return [];
    const list = [...stats.systems[sysTeam]];
    const { key, dir } = sysSort;
    list.sort((a, b) => {
      const av = a[key], bv = b[key];
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? c : -c;
    });
    return list;
  }, [stats, sysTeam, sysSort]);

  const activeStatuses = useMemo(() => {
    if (!stats) return [] as ApplicationStatus[];
    return STATUS_ORDER.filter((s) => s === ApplicationStatus.IN_PROGRESS || s === ApplicationStatus.SUBMITTED || stats.applications.byStatus[s] > 0);
  }, [stats]);

  const toggleSort = (key: keyof SystemDemand) =>
    setSysSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "system" ? "asc" : "desc" }));

  return (
    <div className="min-h-screen pt-24 pb-20 relative">
      <div className="fixed inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), #030608" }} />
      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: "var(--lhr-gray-blue)" }}>Admin</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Stats</h1>
            {stats && (
              <p className="text-[12px] text-white/35 mt-2">
                Step <span className="text-white/60 font-semibold">{stats.step}</span> · computed {new Date(stats.generatedAt).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })} · cached 5 min · aggregate only, no applicant is identifiable here
              </p>
            )}
          </div>
          <button onClick={() => refresh().catch(() => undefined)} disabled={refreshing}
            className={clsx("inline-flex items-center gap-2 px-4 h-10 rounded-lg text-[13px] font-semibold transition-all duration-200",
              refreshing ? "bg-white/5 border border-white/5 text-white/20 cursor-not-allowed" : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white active:scale-95")}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 opacity-60" />}
            Recompute
          </button>
        </div>

        {error && <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">Couldn&apos;t load stats: {String(error.message || error)}</div>}
        {isLoading && !stats && <div className="flex items-center gap-2 text-white/40 text-[13px]"><Loader2 className="h-4 w-4 animate-spin" /> Computing…</div>}

        {stats && (
          <div className="space-y-6">
            {/* Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Tile value={fmtInt(stats.accounts.applicants)} label="Applicant accounts" sub={`+${stats.velocity.accountsLastHour} last hour · +${stats.velocity.accountsLast24h} last 24h`} />
              <Tile value={fmtInt(stats.applications.total)} label="Applications started" sub={`+${stats.velocity.createdLastHour} last hour · +${stats.velocity.createdLast24h} last 24h`} />
              <Tile value={fmtInt(stats.applications.submitted)} label="Submitted" sub={`+${stats.velocity.submittedLastHour} last hour · +${stats.velocity.submittedLast24h} last 24h`} />
              <Tile value={pct(stats.applications.submitted, stats.applications.total)} label="Submit rate" sub={`${fmtInt(stats.applications.byStatus[ApplicationStatus.IN_PROGRESS])} still in progress`} />
              <Tile value={fmtInt(stats.crossTeam.applicants)} label="Distinct applicants" sub={`${fmtInt(stats.crossTeam.byTeamCount[2] + stats.crossTeam.byTeamCount[3])} applied to 2+ teams`} />
            </div>

            {/* Time series */}
            <Card title="Over time" right={
              <div className="flex items-center gap-2 flex-wrap">
                <Segmented value={metric} onChange={setMetric} options={[{ value: "submitted", label: "Submitted" }, { value: "created", label: "Started" }, { value: "accounts", label: "Accounts" }]} />
                <Segmented value={mode} onChange={setMode} options={[{ value: "cumulative", label: "Cumulative" }, { value: "per-bucket", label: "Per bucket" }]} />
                <Segmented value={bucket} onChange={setBucket} options={[{ value: 15, label: "15m" }, { value: 60, label: "1h" }, { value: 1440, label: "Day" }]} />
                <Segmented value={range} onChange={setRange} options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "all", label: "All" }]} />
                <Segmented value={split ? "team" : "total"} onChange={(v) => setSplit(v === "team")} options={[{ value: "total", label: "Total" }, { value: "team", label: "By team", disabled: metric === "accounts" }]} />
                <ExportButton onClick={() => downloadCsv(`${metric}-${mode}-${bucket}m.csv`, [["time", ...series.map((s) => s.label)], ...rows.map((r) => [new Date(r.t).toISOString(), ...series.map((s) => s.value(r))])])} />
              </div>
            }>
              <div className="flex items-center gap-4 mb-2 text-[12px] text-white/50">
                {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-[3px] rounded-full" style={{ background: s.color }} />{s.label}</span>)}
              </div>
              <TimeChart rows={rows} series={series} kind={mode === "cumulative" ? "line" : "bar"} bucket={bucket} />
              {metric === "accounts" && stats.accounts.applicantsWithCreatedAt < stats.accounts.applicants && (
                <p className="text-[11px] text-white/30 mt-2">Accounts line covers {fmtInt(stats.accounts.applicantsWithCreatedAt)} of {fmtInt(stats.accounts.applicants)} applicant accounts — the rest predate creation-time tracking.</p>
              )}
            </Card>

            {/* Team × status */}
            <Card title="Pipeline by team" right={<ExportButton onClick={() => downloadCsv("pipeline-by-team.csv", [["team", "started", "submitted", ...activeStatuses.map((s) => STATUS_LABELS[s])], ...TEAMS.map((t) => [t, stats.applications.byTeam[t].total, stats.applications.byTeam[t].submitted, ...activeStatuses.map((s) => stats.applications.byTeam[t].byStatus[s])]), ["All", stats.applications.total, stats.applications.submitted, ...activeStatuses.map((s) => stats.applications.byStatus[s])]])} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                      <th className="text-left font-semibold py-2 pr-4">Team</th>
                      <th className="text-right font-semibold py-2 px-3">Started</th>
                      <th className="text-right font-semibold py-2 px-3">Submitted</th>
                      {activeStatuses.map((s) => <th key={s} className="text-right font-semibold py-2 px-3">{s === ApplicationStatus.SUBMITTED ? "Awaiting review" : STATUS_LABELS[s]}</th>)}
                      <th className="text-left font-semibold py-2 pl-4 w-40">Submitted share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEAMS.map((t) => {
                      const row = stats.applications.byTeam[t];
                      return (
                        <tr key={t} className="border-t border-white/5">
                          <td className="py-2.5 pr-4 font-semibold text-white flex items-center gap-2"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: getTeamColor(t) }} />{t}</td>
                          <td className="text-right px-3 text-white/80">{fmtInt(row.total)}</td>
                          <td className="text-right px-3 text-white font-semibold">{fmtInt(row.submitted)}</td>
                          {activeStatuses.map((s) => <td key={s} className={clsx("text-right px-3", row.byStatus[s] ? "text-white/80" : "text-white/20")}>{fmtInt(row.byStatus[s])}</td>)}
                          <td className="pl-4"><div className="flex items-center gap-2"><Bar value={row.submitted} max={row.total} color={getTeamColor(t)} /><span className="text-white/50 text-[11px] w-9 text-right">{pct(row.submitted, row.total)}</span></div></td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-white/10 text-white">
                      <td className="py-2.5 pr-4 font-semibold">All teams</td>
                      <td className="text-right px-3 font-semibold">{fmtInt(stats.applications.total)}</td>
                      <td className="text-right px-3 font-semibold">{fmtInt(stats.applications.submitted)}</td>
                      {activeStatuses.map((s) => <td key={s} className="text-right px-3 font-semibold">{fmtInt(stats.applications.byStatus[s])}</td>)}
                      <td className="pl-4"><div className="flex items-center gap-2"><Bar value={stats.applications.submitted} max={stats.applications.total} color={GOLD} /><span className="text-white/50 text-[11px] w-9 text-right">{pct(stats.applications.submitted, stats.applications.total)}</span></div></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* System demand */}
            <Card title="System demand" right={
              <div className="flex items-center gap-2 flex-wrap">
                <Segmented value={sysTeam} onChange={setSysTeam} options={TEAMS.map((t) => ({ value: t, label: t }))} />
                <ExportButton onClick={() => downloadCsv(`system-demand-${sysTeam.toLowerCase()}.csv`, [["system", "1st", "2nd", "3rd", "any", "submitted", "rejectedBy", "interviewOffers", "trialOffers"], ...systemRows.map((r) => [r.system, r.rank1, r.rank2, r.rank3, r.any, r.submitted, r.rejectedBy, r.interviewOffers, r.trialOffers])])} />
              </div>
            }>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                      {([["system", "System"], ["rank1", "1st"], ["rank2", "2nd"], ["rank3", "3rd"], ["any", "Any rank"], ["submitted", "Submitted"], ["rejectedBy", "Rejected by"], ["interviewOffers", "Interviews"], ["trialOffers", "Trials"]] as [keyof SystemDemand, string][]).map(([k, label]) => (
                        <th key={k} onClick={() => toggleSort(k)} className={clsx("font-semibold py-2 px-3 cursor-pointer select-none whitespace-nowrap hover:text-white/70", k === "system" ? "text-left pl-0" : "text-right", sysSort.key === k && "text-white/80")}>
                          {label}{sysSort.key === k ? (sysSort.dir === "desc" ? " ↓" : " ↑") : ""}
                        </th>
                      ))}
                      <th className="text-left font-semibold py-2 pl-4 w-40">Share of team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemRows.map((r) => {
                      const max = Math.max(1, ...stats.systems[sysTeam].map((x) => x.any));
                      return (
                        <tr key={r.system} className="border-t border-white/5">
                          <td className="py-2.5 pr-3 font-semibold text-white whitespace-nowrap">{r.system}</td>
                          {(["rank1", "rank2", "rank3", "any", "submitted", "rejectedBy", "interviewOffers", "trialOffers"] as (keyof SystemDemand)[]).map((k) => (
                            <td key={k} className={clsx("text-right px-3", r[k] ? (k === "any" ? "text-white font-semibold" : "text-white/80") : "text-white/20")}>{fmtInt(r[k] as number)}</td>
                          ))}
                          <td className="pl-4"><Bar value={r.any} max={max} color={getTeamColor(sysTeam)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-white/30 mt-3">Counts of applications ranking each system in that position. &ldquo;Any rank&rdquo; is what a system lead sees in their queue; &ldquo;Rejected by&rdquo;, &ldquo;Interviews&rdquo; and &ldquo;Trials&rdquo; fill in as review progresses.</p>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Cross-team */}
              <Card title="Cross-team applicants">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {([1, 2, 3] as const).map((n) => (
                    <div key={n} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                      <div className="text-[22px] font-bold text-white tabular-nums leading-none">{fmtInt(stats.crossTeam.byTeamCount[n])}</div>
                      <div className="text-[11px] text-white/50 mt-1">{n === 1 ? "one team" : `${n} teams`}</div>
                    </div>
                  ))}
                </div>
                {stats.crossTeam.combos.length > 0 ? (
                  <div className="space-y-2">
                    {stats.crossTeam.combos.map((c) => (
                      <div key={c.teams.join("+")} className="flex items-center gap-3 text-[13px]">
                        <span className="flex items-center gap-1.5 w-48 text-white/80">{c.teams.map((t) => <i key={t} className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: getTeamColor(t) }} />)}<span className="ml-1">{c.teams.join(" + ")}</span></span>
                        <Bar value={c.count} max={stats.crossTeam.combos[0].count} color={GOLD} />
                        <span className="w-10 text-right text-white tabular-nums font-semibold">{fmtInt(c.count)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[12px] text-white/30">No one has applied to more than one team yet.</p>}
              </Card>

              {/* Uploads */}
              <Card title="Uploads (submitted applications)">
                <div className="space-y-4">
                  {([["Resume attached", stats.uploads.resume], ["Portfolio attached", stats.uploads.portfolio]] as [string, number][]).map(([label, v]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-[13px] mb-1.5"><span className="text-white/70">{label}</span><span className="text-white font-semibold tabular-nums">{fmtInt(v)} <span className="text-white/40 font-normal">/ {fmtInt(stats.uploads.submitted)} · {pct(v, stats.uploads.submitted)}</span></span></div>
                      <Bar value={v} max={stats.uploads.submitted} color={GOLD} />
                    </div>
                  ))}
                  <p className="text-[11px] text-white/30">Resumes are required on the form; portfolios are optional. A low resume number here means uploads are failing, not that people skipped it.</p>
                </div>
              </Card>

              {/* Demographics */}
              {([["Major", stats.demographics.major, "majors.csv"], ["Graduation year", stats.demographics.graduationYear, "graduation-years.csv"]] as [string, { value: string; count: number }[], string][]).map(([title, list, file]) => (
                <Card key={title} title={`${title} (submitted)`} right={<ExportButton onClick={() => downloadCsv(file, [[title.toLowerCase(), "count"], ...list.map((x) => [x.value, x.count])])} />}>
                  {list.length === 0 ? <p className="text-[12px] text-white/30">Nothing submitted yet.</p> : (
                    <div className="space-y-2">
                      {list.map((x) => (
                        <div key={x.value} className="flex items-center gap-3 text-[13px]">
                          <span className="w-44 truncate text-white/80" title={x.value}>{x.value}</span>
                          <Bar value={x.count} max={list[0].count} color={x.value === "Other" ? "rgba(255,255,255,0.2)" : GOLD} />
                          <span className="w-10 text-right text-white tabular-nums font-semibold">{fmtInt(x.count)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>

            <p className="text-[11px] text-white/25 leading-relaxed">
              History is reconstructed from creation and submission timestamps rather than stored snapshots, so an application that is submitted and later reopened drops out of the submitted history. Seeded fake applications are excluded. The recruiting bot reads a reduced copy of these numbers from <code className="text-white/40">/api/stats</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
