import type { Metadata } from "next";
import Hero from "@/components/Hero";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import BrandStripes from "@/components/BrandStripes";
import { BRAND_TEAM_COLORS, getBrandTeamInk } from "@/lib/teamColors";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Organization schema for search engines. Static and public — no user data.
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Longhorn Racing",
  url: "https://lhrrecruiting.org",
  logo: "https://lhrrecruiting.org/logo.png",
  description:
    "Longhorn Racing is The University of Texas at Austin's Formula SAE racing organization, building Electric, Solar, and Combustion race cars.",
  parentOrganization: {
    "@type": "CollegeOrUniversity",
    name: "The University of Texas at Austin",
  },
  sameAs: [
    "https://www.instagram.com/longhornracing/",
    "https://www.linkedin.com/company/longhorn-racing/",
    "https://www.longhornracing.org/",
  ],
};

// Bespoke motorsport icons (drawn for this page, not a stock icon set):
// an open-wheel car from above, a ratchet wrench, and a race-engineer headset.
const pillars = [
  {
    title: "Engineering Excellence",
    description:
      "Work with cutting-edge technology and solve complex engineering challenges across mechanical, electrical, and software systems.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {/* front + rear wings */}
        <path strokeLinecap="round" d="M7.25 4.25h9.5" />
        <path strokeLinecap="round" d="M7.75 20.25h8.5" />
        {/* nose + tail */}
        <path strokeLinecap="round" d="M12 4.25v1.5m0 12.5v2" />
        {/* monocoque */}
        <rect x="10" y="5.75" width="4" height="12.5" rx="2" strokeLinejoin="round" />
        {/* cockpit */}
        <circle cx="12" cy="11" r="1.1" />
        {/* wheels */}
        <rect x="5.9" y="6.4" width="2.1" height="3.7" rx="0.9" />
        <rect x="16" y="6.4" width="2.1" height="3.7" rx="0.9" />
        <rect x="5.9" y="14" width="2.1" height="3.7" rx="0.9" />
        <rect x="16" y="14" width="2.1" height="3.7" rx="0.9" />
      </svg>
    ),
  },
  {
    title: "Hands-on Experience",
    description:
      "Apply classroom theory to real-world problems. Machine parts, wire harnesses, write firmware — build something that races.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {/* combination wrench: open jaw (notched head), shaft, ring end */}
        <path
          strokeLinejoin="round"
          d="M3.06 6.22 A3.9 3.9 0 1 0 6.22 3.06 L6.31 5.63 L5.63 6.31 Z"
        />
        <path strokeLinecap="round" strokeWidth={2.5} d="M9.7 9.7l6.2 6.2" />
        <circle cx="17.4" cy="17.4" r="2.1" />
      </svg>
    ),
  },
  {
    title: "Community",
    description:
      "Join a passionate, family-like team of students dedicated to collaboration, innovation, and pushing each other to be better.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {/* headband */}
        <path strokeLinecap="round" d="M5.25 13.5v-1.75a6.75 6.75 0 0 1 13.5 0v1.75" />
        {/* ear cups */}
        <rect x="3.75" y="12.75" width="3.4" height="5.5" rx="1.5" strokeLinejoin="round" />
        <rect x="16.85" y="12.75" width="3.4" height="5.5" rx="1.5" strokeLinejoin="round" />
        {/* mic boom */}
        <path strokeLinecap="round" d="M18.55 18.5v.35a2.9 2.9 0 0 1-2.9 2.9h-2.4" />
      </svg>
    ),
  },
];

const teams = [
  {
    name: "Electric",
    acronym: "LHRe",
    description: "Designing and building a high-performance electric race car for Formula SAE Electric competition.",
    color: BRAND_TEAM_COLORS.Electric,
    href: "/teams?team=electric",
  },
  {
    name: "Solar",
    acronym: "LHRs",
    description: "Engineering a solar-powered vehicle built to race across the country on nothing but sunlight.",
    color: BRAND_TEAM_COLORS.Solar,
    href: "/teams?team=solar",
  },
  {
    name: "Combustion",
    acronym: "LHRc",
    description: "Building a combustion-powered formula-style car for the original Formula SAE competition.",
    color: BRAND_TEAM_COLORS.Combustion,
    href: "/teams?team=combustion",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--pub-bg)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
      />
      <Hero />

      {/* ─── Pillars Section ─── */}
      <section className="relative py-24">
        <div className="container mx-auto px-6 md:px-10 max-w-6xl relative z-10">
          {/* Section header */}
          <Reveal className="mb-16">
            <p
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
              style={{ color: 'var(--pub-text-3)' }}
            >
              Why Longhorn Racing
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: 'var(--pub-heading)' }}>
              More than a club.{' '}
              <span style={{ color: 'var(--pub-heading-accent)' }}>A launchpad.</span>
            </h2>
          </Reveal>

          {/* Pillar cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {pillars.map((item, index) => (
              <Reveal key={index} delay={index * 90}>
                <div
                  className="group relative h-full p-7 rounded-xl transition-all duration-300 hover:-translate-y-1"
                  style={{
                    backgroundColor: 'var(--pub-surface)',
                    border: '1px solid var(--pub-border)',
                  }}
                >
                  {/* Top accent stripe */}
                  <div
                    className="absolute top-0 left-6 right-6 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: 'linear-gradient(90deg, var(--lhr-blue), var(--lhr-gold))' }}
                  />

                  {/* Icon */}
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center mb-5 transition-colors duration-300"
                    style={{
                      backgroundColor: 'var(--pub-chip-blue-bg)',
                      color: 'var(--pub-chip-blue-ink)',
                    }}
                  >
                    {item.icon}
                  </div>

                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--pub-heading)' }}>{item.title}</h3>
                  <p className="font-urbanist text-[15px] leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
                    {item.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Teams Section ─── */}
      <section className="relative py-24">
        {/* Subtle divider */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }} />

        <div className="container mx-auto px-6 md:px-10 max-w-6xl">
          {/* Section header */}
          <Reveal className="mb-16">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <p
                  className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
                  style={{ color: 'var(--pub-text-3)' }}
                >
                  Three Teams, One Mission
                </p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: 'var(--pub-heading)' }}>
                  Find your team.
                </h2>
              </div>
              <Link
                href="/teams"
                className="group flex items-center gap-2 text-sm font-medium transition-colors duration-200"
                style={{ color: 'var(--pub-link)' }}
              >
                Explore all teams
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </Reveal>

          {/* Team cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {teams.map((team, index) => (
              <Reveal key={team.name} delay={index * 90}>
                <Link
                  href={team.href}
                  className="group relative block h-full rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{
                    backgroundColor: 'var(--pub-surface)',
                    border: '1px solid var(--pub-border)',
                  }}
                >
                  {/* Team stripe at top */}
                  <div className="h-1 w-full" style={{ backgroundColor: team.color }} />

                  <div className="p-7">
                    {/* Team name + acronym */}
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-xl font-bold" style={{ color: 'var(--pub-heading)' }}>{team.name}</h3>
                      <span
                        className="text-xs font-semibold tracking-wider px-2 py-0.5 rounded"
                        style={{
                          color: getBrandTeamInk(team.name),
                          backgroundColor: `${team.color}22`,
                        }}
                      >
                        {team.acronym}
                      </span>
                    </div>

                    <p className="font-urbanist text-[15px] leading-relaxed mb-6" style={{ color: 'var(--pub-text-2)' }}>
                      {team.description}
                    </p>

                    {/* Arrow link indicator */}
                    <div
                      className="flex items-center gap-2 text-sm font-medium transition-all duration-200"
                      style={{ color: getBrandTeamInk(team.name) }}
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        Learn more
                      </span>
                      <svg className="w-4 h-4 -translate-x-14 group-hover:translate-x-0 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mission / CTA Section ─── */}
      <section className="relative py-28 overflow-hidden">
        {/* Ambient brand glows over the page background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, var(--pub-glow-1) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, var(--pub-glow-2) 0%, transparent 50%)',
          }}
        />
        {/* Subtle divider */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }} />

        <div className="container mx-auto px-6 md:px-10 max-w-4xl relative z-10 text-center">
          <Reveal>
            <p
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-6"
              style={{ color: 'var(--pub-text-3)' }}
            >
              Our Mission
            </p>

            <blockquote className="text-2xl md:text-3xl lg:text-4xl font-semibold leading-snug tracking-tight mb-10" style={{ color: 'var(--pub-heading)' }}>
              To provide students with the opportunity to explore different engineering fields and grow
              their tangible skills through a{' '}
              <span style={{ color: 'var(--pub-heading-accent)' }}>collaborative</span> and{' '}
              <span style={{ color: 'var(--pub-link)' }}>innovative</span> environment.
            </blockquote>

            {/* Decorative stripes */}
            <BrandStripes className="justify-center mb-12" />

            <Link
              href="/apply"
              className="group inline-flex items-center gap-3 h-14 px-10 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
              style={{
                backgroundColor: 'var(--pub-cta)',
                color: 'var(--pub-cta-ink)',
                boxShadow: '0 0 40px rgba(255,181,38,0.15)',
              }}
            >
              Start Your Application
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
