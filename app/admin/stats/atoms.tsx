"use client";

import clsx from "clsx";
import { Download } from "lucide-react";

// Shared building blocks for /admin/stats (StatsView + the per-step phase
// panels). Pure presentation — no data fetching here.

export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

export const GOLD = "var(--lhr-gold)";

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
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

export function Card({ title, right, children, className }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
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

export function Tile({ value, label, sub, tone }: { value: string; label: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className={clsx("rounded-xl border px-4 py-3.5",
      tone === "warn" ? "border-amber-400/25 bg-amber-400/[0.06]" : tone === "good" ? "border-emerald-400/20 bg-emerald-400/[0.05]" : "border-white/10 bg-white/[0.04]")}>
      <div className={clsx("text-[26px] font-bold tracking-tight tabular-nums leading-none", tone === "warn" ? "text-amber-300" : "text-white")}>{value}</div>
      <div className="text-[12px] text-white/60 mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-white/35 mt-0.5">{sub}</div>}
    </div>
  );
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-white/10 text-[12px] font-semibold text-white/50 hover:text-white hover:bg-white/5">
      <Download className="h-3 w-3" /> CSV
    </button>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-white/5 w-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (100 * value) / max : 0}%`, background: color }} />
    </div>
  );
}
