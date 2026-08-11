import Link from "next/link";

/**
 * Shown in place of the apply flow while the recruiting cycle is at the
 * PRE_OPEN step. Copy is deliberately generic (no dates) — admins announce
 * the actual open date via the dashboard announcement banner.
 */
export default function ApplicationsNotOpenNotice() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(255,181,38,0.04)',
        border: '1px solid rgba(255,181,38,0.15)',
      }}
    >
      <div className="h-1" style={{ backgroundColor: 'var(--lhr-gold)' }} />
      <div className="p-8 md:p-10">
        <p
          className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
          style={{ color: 'var(--lhr-gold)' }}
        >
          Coming Soon
        </p>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-3">
          Applications aren&apos;t open yet
        </h2>
        {/* Only opacities from the globals.css light-mode override list —
            text-white/45 isn't in it and stays white on white. */}
        <p className="font-urbanist text-[14px] text-white/40 leading-relaxed max-w-xl mb-8">
          You&apos;re early — the next recruiting cycle hasn&apos;t started. When
          applications open, this is where you&apos;ll apply. In the meantime, get to
          know the teams and the systems you could join.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/teams"
            className="inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
            style={{ backgroundColor: 'var(--lhr-gold)', color: '#000' }}
          >
            Explore Teams
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
