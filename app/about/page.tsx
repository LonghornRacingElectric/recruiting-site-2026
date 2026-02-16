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
      <main className="min-h-screen bg-black pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="animate-pulse flex flex-col items-center gap-6 max-w-4xl mx-auto">
            <div className="h-12 w-64 bg-neutral-800 rounded-lg" />
            <div className="h-6 w-48 bg-neutral-800 rounded-lg" />
            <div className="h-32 w-full bg-neutral-800 rounded-2xl" />
            <div className="h-48 w-full bg-neutral-800 rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="mb-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-4">
            {config?.title || "About Longhorn Racing"}
          </h1>
          {config?.subtitle && (
            <p className="text-xl text-orange-500 font-semibold mb-8">
              {config.subtitle}
            </p>
          )}
        </section>

        {/* Mission Statement */}
        {config?.missionStatement && (
          <section className="mb-16 max-w-4xl mx-auto">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-orange-950/30 to-neutral-950 border border-orange-500/20">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-orange-500">🎯</span> Our Mission
              </h2>
              <p className="text-neutral-300 leading-relaxed text-lg">
                {config.missionStatement}
              </p>
            </div>
          </section>
        )}

        {/* Dynamic Sections */}
        {config?.sections && config.sections.length > 0 && (
          <section className="mb-16 max-w-4xl mx-auto space-y-8">
            {config.sections.sort((a, b) => a.order - b.order).map((section) => (
              <div
                key={section.id}
                className="p-8 rounded-2xl bg-neutral-900 border border-white/5"
              >
                <h2 className="text-2xl font-bold text-white mb-4">
                  {section.title}
                </h2>
                <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* Teams CTA */}
        <section className="text-center mt-16">
          <h2 className="text-2xl font-bold text-white mb-4">Explore Our Teams</h2>
          <p className="text-neutral-400 mb-8 max-w-2xl mx-auto">
            Longhorn Racing is divided into three specialized teams: Electric, Solar, and Combustion.
            Each team focuses on a different technology.
          </p>
          <Link
            href="/teams"
            className="inline-flex items-center gap-2 px-8 py-4 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-500 transition-colors shadow-lg shadow-orange-600/25"
          >
            View Our Teams
            <span>→</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
