"use client";

import { downloadCsv } from "@/lib/utils/downloadFile";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { AUDIT_ACTION_LABELS, type AuditAction, type AuditEntryDto } from "@/lib/models/Audit";

const PAGE = 300;
type Cursor = { seconds: number; nanos: number; id: string };

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function actorLabel(e: AuditEntryDto): string {
  const who = e.actor?.name || e.actor?.email || e.actor?.uid || "unknown";
  const scope = e.actor?.system || e.actor?.team;
  return scope ? `${who} · ${scope}` : who;
}

export function ActivityView() {
  const [entries, setEntries] = useState<AuditEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string>("");
  const [actorQuery, setActorQuery] = useState("");
  const [appQuery, setAppQuery] = useState("");
  const [refusedOnly, setRefusedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Paged: the newest PAGE first, "Load older" appends. `total` is the exact
  // count for the scope (null when the server can't count it cheaply).
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Every (re)load bumps this; a "Load older" that started under an earlier
  // filter must not append its rows, or its cursor, to the new list.
  const generation = useRef(0);

  const fetchPage = useCallback(async (cursor: Cursor | null) => {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (action) q.set("action", action);
    if (cursor) { q.set("beforeSeconds", String(cursor.seconds)); q.set("beforeNanos", String(cursor.nanos)); q.set("beforeId", cursor.id); }
    const res = await fetch(`/api/admin/audit?${q}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
    return res.json() as Promise<{ entries: AuditEntryDto[]; hasMore: boolean; nextCursor: Cursor | null; total?: number | null }>;
  }, [action]);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true); setError(null);
    setEntries([]); setHasMore(false); setNextCursor(null); setTotal(null);
    try {
      const data = await fetchPage(null);
      if (gen !== generation.current) return;
      setEntries(data.entries || []);
      setHasMore(Boolean(data.hasMore));
      setNextCursor(data.nextCursor ?? null);
      setTotal(typeof data.total === "number" ? data.total : null);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true); setError(null);
    try {
      const data = await fetchPage(nextCursor);
      if (gen !== generation.current) return;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...(data.entries || []).filter((e) => !seen.has(e.id))];
      });
      setHasMore(Boolean(data.hasMore));
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, nextCursor, loadingMore]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const a = actorQuery.trim().toLowerCase(), p = appQuery.trim().toLowerCase();
    return entries.filter((e) =>
      (!a || actorLabel(e).toLowerCase().includes(a) || (e.actor?.email || "").toLowerCase().includes(a)) &&
      (!p || (e.applicationId || "").toLowerCase().includes(p) || (e.targetUid || "").toLowerCase().includes(p)) &&
      (!refusedOnly || e.outcome === "refused")
    );
  }, [entries, actorQuery, appQuery, refusedOnly]);

  const exportCsv = () => downloadCsv("activity.csv", [
    ["time", "actor", "email", "role", "action", "outcome", "application", "team", "systems", "detail"],
    ...rows.map((e) => [e.at, e.actor?.name || "", e.actor?.email || "", e.actor?.role || "", e.action, e.outcome, e.applicationId || e.targetUid || "", e.applicantTeam || "", (e.systems || []).join("+"), e.detail || ""]),
  ]);

  return (
    <div className="min-h-screen pt-24 pb-20 relative">
      <div className="fixed inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), #030608" }} />
      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: "var(--lhr-gray-blue)" }}>Admin</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Activity</h1>
            <p className="text-[12px] text-white/35 mt-2">Every staff action on applications, users and configuration — who, what, when. Refused attempts are recorded too. No applicant names or emails appear here.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-2 px-3 h-10 rounded-lg text-[13px] font-semibold bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={load} disabled={loading} className={clsx("inline-flex items-center gap-2 px-4 h-10 rounded-lg text-[13px] font-semibold transition-all", loading ? "bg-white/5 border border-white/5 text-white/20" : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white")}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 opacity-60" />} Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={action} onChange={(e) => setAction(e.target.value)} className="h-8 px-2 rounded-md text-[12px] bg-white/5 border border-white/10 text-white/80">
            <option value="">All actions</option>
            {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>)}
          </select>
          <input value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} placeholder="Filter by staff name / email" className="h-8 px-2.5 rounded-md text-[12px] bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 w-56" />
          <input value={appQuery} onChange={(e) => setAppQuery(e.target.value)} placeholder="Application or user id" className="h-8 px-2.5 rounded-md text-[12px] bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 w-48" />
          <label className="inline-flex items-center gap-1.5 text-[12px] text-white/60 select-none"><input type="checkbox" checked={refusedOnly} onChange={(e) => setRefusedOnly(e.target.checked)} /> Refused only</label>
          <span className="text-[12px] text-white/30 ml-auto">
            {rows.length} shown · {entries.length} loaded{total !== null ? ` of ${total.toLocaleString()} total` : ""}
          </span>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">{error}</div>}
        {hasMore && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-[12px] text-white/60 flex items-center gap-3 flex-wrap">
            <span>Loaded the newest {entries.length}{total !== null ? ` of ${total.toLocaleString()}` : ""} — the staff / application filters and the CSV cover only what's loaded.</span>
            <button type="button" onClick={loadMore} disabled={loadingMore} className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-white/10 hover:bg-white/15 border border-white/15 disabled:opacity-50">
              {loadingMore ? "Loading…" : `Load older${total !== null ? ` (${(total - entries.length).toLocaleString()} more)` : ""}`}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                <th className="text-left font-semibold py-2.5 px-3">When</th>
                <th className="text-left font-semibold py-2.5 px-3">Who</th>
                <th className="text-left font-semibold py-2.5 px-3">Action</th>
                <th className="text-left font-semibold py-2.5 px-3">Target</th>
                <th className="text-left font-semibold py-2.5 px-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id ?? null)} className="border-t border-white/5 align-top cursor-pointer hover:bg-white/[0.03]">
                  <td className="py-2.5 px-3 whitespace-nowrap text-white/60">{fmtWhen(e.at)}</td>
                  <td className="py-2.5 px-3 text-white/80"><div className="font-semibold text-white">{e.actor?.name || e.actor?.email || e.actor?.uid}</div><div className="text-[11px] text-white/40">{[e.actor?.role, e.actor?.system || e.actor?.team].filter(Boolean).join(" · ")}</div></td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={clsx("inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold", e.outcome === "ok" && "bg-white/5 text-white/70 border border-white/10")}
                      // Inline colours (like the sidebar badges) so refused/error read in both themes.
                      style={e.outcome === "refused" ? { backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "rgba(220,38,38,0.95)" } : e.outcome === "error" ? { backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", color: "rgba(217,119,6,0.95)" } : undefined}
                    >
                      {e.outcome === "refused" ? "Refused · " : e.outcome === "error" ? "Error · " : ""}{AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-white/60">
                    {e.applicationId ? <Link href={`/admin/applications/${e.applicationId}`} onClick={(ev) => ev.stopPropagation()} className="hover:text-white underline-offset-2 hover:underline">{e.applicationId.slice(0, 8)}…</Link> : e.targetUid ? <span title={e.targetUid}>user {e.targetUid.slice(0, 8)}…</span> : <span className="text-white/25">—</span>}
                    {e.applicantTeam && <span className="ml-1.5 text-[11px] text-white/35">{e.applicantTeam}</span>}
                  </td>
                  <td className="py-2.5 px-3 text-white/60">
                    <div>{e.detail || ""}{e.systems?.length ? <span className="text-white/35"> · {e.systems.join(", ")}</span> : null}</div>
                    {expanded === e.id && (e.before || e.after) && (
                      <pre className="mt-2 text-[11px] leading-snug text-white/60 bg-white/5 border border-white/10 rounded-md p-2 overflow-x-auto">{JSON.stringify({ before: e.before, after: e.after }, null, 1)}</pre>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-white/30 text-[13px]">Nothing recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
