import type { Metadata } from "next";
import Hero from "@/components/Hero";
import Image from "next/image";
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

const pillars = [
  {
    title: "Engineering Excellence",
    description:
      "Work with cutting-edge technology and solve complex engineering challenges across mechanical, electrical, and software systems.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Hands-on Experience",
    description:
      "Apply classroom theory to real-world problems. Machine parts, wire harnesses, write firmware — build something that races.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
  },
  {
    title: "Community",
    description:
      "Join a passionate, family-like team of students dedicated to collaboration, innovation, and pushing each other to be better.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
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
    image: "/home/electric.avif",
  },
  {
    name: "Solar",
    acronym: "LHRs",
    description: "Engineering a solar-powered vehicle built to race across the country on nothing but sunlight.",
    color: BRAND_TEAM_COLORS.Solar,
    href: "/teams?team=solar",
    image: "/home/solar.avif",
  },
  {
    name: "Combustion",
    acronym: "LHRc",
    description: "Building a combustion-powered formula-style car for the original Formula SAE competition.",
    color: BRAND_TEAM_COLORS.Combustion,
    href: "/teams?team=combustion",
    image: "/home/combustion.avif",
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

                  {/* Team vehicle photo */}
                  <div
                    className="relative h-44 overflow-hidden"
                    style={{ borderBottom: '1px solid var(--pub-border)' }}
                  >
                    <Image
                      src={team.image}
                      alt={`Longhorn Racing ${team.name} vehicle`}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>

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
