"use client";

import { useEffect, useState } from "react";
import { AboutPageConfig } from "@/lib/models/Config";
import Link from "next/link";

export default function AboutPage() {
  const [config, setConfig] = useState<AboutPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAbout() {
      try {
        const response = await fetch("/api/about");
        if (response.ok) {
          const data = await response.json();
          setConfig(data.config);
        }
      } catch (error) {
        console.error("Failed to fetch about:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAbout();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen pt-24 pb-20" style={{ background: '#030608' }}>
        <div className="container mx-auto px-6 md:px-10 max-w-3xl">
          <div className="animate-pulse flex flex-col gap-6">
            <div className="h-4 w-28 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <div className="h-10 w-72 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <div className="h-5 w-48 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <div className="h-32 w-full rounded-xl mt-6" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }} />
            <div className="h-48 w-full rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }} />
            <div className="h-48 w-full rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at 30% 0%, rgba(4,95,133,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(255,181,38,0.04) 0%, transparent 40%), #030608',
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Page Header */}
        <section className="mb-16">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: 'var(--lhr-gray-blue)' }}
          >
            About
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            {config?.title || "About Longhorn Racing"}
          </h1>
          {config?.subtitle && (
            <p className="text-lg font-medium" style={{ color: 'var(--lhr-gold)' }}>
              {config.subtitle}
            </p>
          )}
          {/* Stripe accent */}
          <div className="flex gap-2 mt-8">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>
        </section>

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
                    <svg className="w-4 h-4" style={{ color: 'var(--lhr-blue-light)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-white">Our Mission</h2>
                </div>
                <p className="font-urbanist text-[15px] text-white/60 leading-relaxed">
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
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="p-7">
                  <h2 className="text-[12px] font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--lhr-gray-blue)' }}>
                    {section.title}
                  </h2>
                  <p className="font-urbanist text-[15px] text-white/60 leading-relaxed whitespace-pre-wrap">
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
              style={{ color: 'var(--lhr-gray-blue)' }}
            >
              Three Teams, One Mission
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-4">
              Explore Our Teams
            </h2>
            <p className="font-urbanist text-[15px] text-white/40 mb-8 max-w-lg mx-auto leading-relaxed">
              Longhorn Racing is divided into three specialized teams: Electric, Solar, and Combustion.
              Each team focuses on a different powertrain technology.
            </p>
            <Link
              href="/teams"
              className="group inline-flex items-center gap-2 h-12 px-8 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{
                backgroundColor: 'var(--lhr-gold)',
                color: '#000',
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
