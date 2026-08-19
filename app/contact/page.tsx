import Link from "next/link";
import BrandStripes from "@/components/BrandStripes";
import { getContactPageConfig } from "@/lib/firebase/config";
import { ContactChannel } from "@/lib/models/Config";

// Server component: content comes from config/contact_page (admin-editable in
// /admin/configuration → Contact) and renders in the initial HTML.

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  instagram: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
  linkedin: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
};

// Generic link icon for channels without a dedicated one.
const DEFAULT_CHANNEL_ICON = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);

function channelIcon(channel: ContactChannel): React.ReactNode {
  return CHANNEL_ICONS[channel.name.trim().toLowerCase()] ?? DEFAULT_CHANNEL_ICON;
}

const OUTLINK_ARROW = (
  <svg
    className="w-4 h-4 text-[var(--pub-text-3)] opacity-50 group-hover:opacity-100 transition-all duration-200 mt-1 shrink-0 group-hover:translate-x-0.5"
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
  </svg>
);

export default async function ContactPage() {
  const config = await getContactPageConfig();

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Page Header */}
        <section className="mb-14 animate-fade-slide-up">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: 'var(--pub-text-3)' }}
          >
            Contact
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
            Get in touch.
          </h1>
          <p className="font-urbanist text-[15px] max-w-lg leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
            {config.intro}
          </p>
          {/* Stripe accent */}
          <BrandStripes className="mt-8" animated />
        </section>

        {/* Email Card */}
        <section className="mb-4">
          <a
            href={`mailto:${config.email}`}
            className="group block rounded-xl overflow-hidden transition-all duration-200"
            style={{
              backgroundColor: 'rgba(4,95,133,0.06)',
              border: '1px solid rgba(4,95,133,0.15)',
            }}
          >
            <div className="p-7 flex items-start gap-5">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200"
                style={{ backgroundColor: 'rgba(4,95,133,0.15)' }}
              >
                <svg className="w-5 h-5" style={{ color: 'var(--pub-chip-blue-ink)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--pub-text-3)' }}>
                  Email
                </p>
                <p className="text-[15px] font-semibold mb-1 group-hover:underline underline-offset-4 break-all" style={{ color: 'var(--pub-heading)' }}>
                  {config.email}
                </p>
                <p className="font-urbanist text-[13px] leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
                  {config.emailDescription}
                </p>
              </div>
              {OUTLINK_ARROW}
            </div>
          </a>
        </section>

        {/* Social Cards */}
        <section className="space-y-4 mb-16">
          {config.channels.map((channel) => (
            <a
              key={channel.id}
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl overflow-hidden transition-all duration-200 bg-[var(--pub-surface)] border border-[var(--pub-border)] hover:border-[var(--pub-border-strong)]"
            >
              <div className="p-7 flex items-start gap-5">
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 text-[var(--pub-text-2)] group-hover:text-[var(--pub-heading)] transition-colors duration-200"
                  style={{ backgroundColor: 'var(--pub-surface-2)' }}
                >
                  {channelIcon(channel)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--pub-text-3)' }}>
                    {channel.name}
                  </p>
                  <p className="text-[15px] font-semibold mb-1 group-hover:underline underline-offset-4" style={{ color: 'var(--pub-heading)' }}>
                    {channel.handle}
                  </p>
                  <p className="font-urbanist text-[13px] leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
                    {channel.description}
                  </p>
                </div>
                {OUTLINK_ARROW}
              </div>
            </a>
          ))}
        </section>

        {/* Bottom CTA */}
        <section className="relative py-16 -mx-6 md:-mx-10 px-6 md:px-10">
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }}
          />

          <div className="text-center">
            <p
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
              style={{ color: 'var(--pub-text-3)' }}
            >
              Ready to join?
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
              {config.ctaHeading}
            </h2>
            <p className="font-urbanist text-[15px] mb-8 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
              {config.ctaText}
            </p>
            <Link
              href="/apply"
              className="group inline-flex items-center gap-2 h-12 px-8 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{
                backgroundColor: 'var(--pub-cta)',
                color: 'var(--pub-cta-ink)',
              }}
            >
              Apply Now
              <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
