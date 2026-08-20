import { getAboutPageConfig } from "@/lib/firebase/config";
import Image from "next/image";
import Link from "next/link";
import BrandStripes from "@/components/BrandStripes";
import Reveal from "@/components/Reveal";

// Server component: About content comes straight from Firestore and renders in
// the initial HTML (it was previously fetched client-side after mount, which
// left crawlers a skeleton).

export default async function AboutPage() {
  const config = await getAboutPageConfig();

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Page Header */}
        <section className="mb-16 animate-fade-slide-up">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: 'var(--pub-text-3)' }}
          >
            About
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
            {config?.title || "About Longhorn Racing"}
          </h1>
          {config?.subtitle && (
            <p className="text-lg font-medium" style={{ color: 'var(--pub-heading-accent)' }}>
              {config.subtitle}
            </p>
          )}
          {/* Stripe accent */}
          <BrandStripes className="mt-8" animated />
        </section>

        {/* The three vehicles */}
        <Reveal className="mb-12">
          <div className="grid grid-cols-3 gap-3">
            {[
              { src: '/teams/electric.avif', alt: 'Longhorn Racing Electric vehicle' },
              { src: '/teams/solar.avif', alt: 'Longhorn Racing Solar vehicle' },
              { src: '/teams/combustion.avif', alt: 'Longhorn Racing Combustion vehicle' },
            ].map((photo) => (
              <div
                key={photo.src}
                className="relative h-32 sm:h-40 rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--pub-surface)', border: '1px solid var(--pub-border)' }}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 768px) 256px, 33vw"
                  className="object-cover"
                  priority
                />
              </div>
            ))}
          </div>
        </Reveal>

        {/* Mission Statement */}
        {config?.missionStatement && (
          <section className="mb-12">
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'rgba(4,95,133,0.06)',
                border: '1px solid rgba(4,95,133,0.15)',
              }}
            >
              <div className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(4,95,133,0.15)' }}
                  >
                    <svg className="w-4 h-4" style={{ color: 'var(--pub-chip-blue-ink)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--pub-heading)' }}>Our Mission</h2>
                </div>
                <p className="font-urbanist text-[15px] leading-relaxed" style={{ color: 'var(--pub-text)' }}>
                  {config.missionStatement}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Dynamic Sections */}
        {config?.sections && config.sections.length > 0 && (
          <section className="mb-16 space-y-4">
            {config.sections.sort((a, b) => a.order - b.order).map((section, index) => (
              <div
                key={section.id}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: 'var(--pub-surface)',
                  border: '1px solid var(--pub-border)',
                }}
              >
                <div className="p-7">
                  <h2 className="text-[12px] font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--pub-text-3)' }}>
                    {section.title}
                  </h2>
                  <p className="font-urbanist text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--pub-text)' }}>
                    {section.content}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Teams CTA */}
        <section className="relative py-16 -mx-6 md:-mx-10 px-6 md:px-10 overflow-hidden">
          {/* Divider */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }}
          />

          <div className="max-w-3xl mx-auto text-center">
            <p
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
              style={{ color: 'var(--pub-text-3)' }}
            >
              Three Teams, One Mission
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
              Explore Our Teams
            </h2>
            <p className="font-urbanist text-[15px] mb-8 max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
              Longhorn Racing is divided into three specialized teams: Electric, Solar, and Combustion.
              Each team focuses on a different powertrain technology.
            </p>
            <Link
              href="/teams"
              className="group inline-flex items-center gap-2 h-12 px-8 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{
                backgroundColor: 'var(--pub-cta)',
                color: 'var(--pub-cta-ink)',
              }}
            >
              View Our Teams
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
