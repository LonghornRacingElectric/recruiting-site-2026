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
        backgroundColor: 'var(--status-warn-bg)',
        border: '1px solid var(--status-warn-border)',
      }}
    >
      <div className="h-1" style={{ backgroundColor: 'var(--lhr-gold)' }} />
      <div className="p-8 md:p-10">
        <p
          className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
          style={{ color: 'var(--status-warn-ink)' }}
        >
          Coming Soon
        </p>
        <h2 className="text-xl md:text-2xl font-bold mb-3" style={{ color: 'var(--pub-heading)' }}>
          Applications aren&apos;t open yet
        </h2>
        <p className="font-urbanist text-[14px] leading-relaxed max-w-xl mb-8" style={{ color: 'var(--pub-text)' }}>
          You&apos;re early — the next recruiting cycle hasn&apos;t started. When
          applications open, this is where you&apos;ll apply. In the meantime, get to
          know the teams and the systems you could join.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/teams"
            className="inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
            style={{ backgroundColor: 'var(--pub-cta)', color: 'var(--pub-cta-ink)' }}
          >
            Explore Teams
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
            style={{
              backgroundColor: 'var(--pub-surface-2)',
              border: '1px solid var(--pub-border)',
              color: 'var(--pub-text)',
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
