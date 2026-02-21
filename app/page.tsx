import Hero from "@/components/Hero";
import Link from "next/link";

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
    color: "#FFB526",
    href: "/teams",
  },
  {
    name: "Solar",
    acronym: "LHRs",
    description: "Engineering a solar-powered vehicle built to race across the country on nothing but sunlight.",
    color: "#FF9404",
    href: "/teams",
  },
  {
    name: "Combustion",
    acronym: "LHRc",
    description: "Building a combustion-powered formula-style car for the original Formula SAE competition.",
    color: "#FFC871",
    href: "/teams",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <Hero />

      {/* ─── Pillars Section ─── */}
      <section className="relative py-24 noise-overlay" style={{ background: 'linear-gradient(180deg, #000 0%, #060d12 100%)' }}>
        <div className="container mx-auto px-6 md:px-10 max-w-6xl relative z-10">
          {/* Section header */}
          <div className="mb-16">
            <p
              className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
              style={{ color: 'var(--lhr-gray-blue)' }}
            >
              Why Longhorn Racing
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              More than a club.{' '}
              <span style={{ color: 'var(--lhr-gold)' }}>A launchpad.</span>
            </h2>
          </div>

          {/* Pillar cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {pillars.map((item, index) => (
              <div
                key={index}
                className="group relative p-7 rounded-xl border border-white/[0.06] transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
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
                    backgroundColor: 'rgba(4, 95, 133, 0.15)',
                    color: 'var(--lhr-blue-light)',
                  }}
                >
                  {item.icon}
                </div>

                <h3 className="text-lg font-semibold mb-3 text-white">{item.title}</h3>
                <p className="font-urbanist text-[15px] leading-relaxed" style={{ color: 'var(--lhr-gray-blue)' }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Teams Section ─── */}
      <section className="relative py-24" style={{ background: '#050a0e' }}>
        {/* Subtle divider */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }} />

        <div className="container mx-auto px-6 md:px-10 max-w-6xl">
          {/* Section header */}
          <div className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p
                className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
                style={{ color: 'var(--lhr-gray-blue)' }}
              >
                Three Teams, One Mission
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Find your team.
              </h2>
            </div>
            <Link
              href="/teams"
              className="group flex items-center gap-2 text-sm font-medium transition-colors duration-200"
              style={{ color: 'var(--lhr-gold)' }}
            >
              Explore all teams
              <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>

          {/* Team cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Link
                key={team.name}
                href={team.href}
                className="group relative rounded-xl border border-white/[0.06] overflow-hidden transition-all duration-300 hover:border-white/[0.12] hover:-translate-y-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                {/* Team stripe at top */}
                <div className="h-1 w-full" style={{ backgroundColor: team.color }} />

                <div className="p-7">
                  {/* Team name + acronym */}
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xl font-bold text-white">{team.name}</h3>
                    <span
                      className="text-xs font-semibold tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color: team.color,
                        backgroundColor: `${team.color}15`,
                      }}
                    >
                      {team.acronym}
                    </span>
                  </div>

                  <p className="font-urbanist text-[15px] leading-relaxed mb-6" style={{ color: 'var(--lhr-gray-blue)' }}>
                    {team.description}
                  </p>

                  {/* Arrow link indicator */}
                  <div
                    className="flex items-center gap-2 text-sm font-medium transition-all duration-200"
                    style={{ color: team.color }}
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
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mission / CTA Section ─── */}
      <section className="relative py-28 overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, rgba(4,95,133,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(255,181,38,0.08) 0%, transparent 50%), #030608',
          }}
        />
        {/* Subtle divider */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(4,95,133,0.3), transparent)' }} />

        <div className="container mx-auto px-6 md:px-10 max-w-4xl relative z-10 text-center">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-6"
            style={{ color: 'var(--lhr-gray-blue)' }}
          >
            Our Mission
          </p>

          <blockquote className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white leading-snug tracking-tight mb-10">
            To provide students with the opportunity to explore different engineering fields and grow
            their tangible skills through a{' '}
            <span style={{ color: 'var(--lhr-gold)' }}>collaborative</span> and{' '}
            <span style={{ color: 'var(--lhr-blue-light)' }}>innovative</span> environment.
          </blockquote>

          {/* Decorative stripes */}
          <div className="flex justify-center gap-2 mb-12">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>

          <Link
            href="/apply"
            className="group inline-flex items-center gap-3 h-14 px-10 rounded-lg font-semibold text-sm tracking-wide transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
            style={{
              backgroundColor: 'var(--lhr-gold)',
              color: '#000',
              boxShadow: '0 0 40px rgba(255,181,38,0.15)',
            }}
          >
            Start Your Application
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </main>
  );
}
