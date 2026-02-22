"use client";

import Link from "next/link";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";

const TEAM_ACRONYMS: Record<string, string> = {
  Electric: "LHRe",
  Solar: "LHRs",
  Combustion: "LHRc",
};

export default function ApplyPage() {
  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at 30% 0%, rgba(4,95,133,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(255,181,38,0.04) 0%, transparent 40%), #030608',
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        {/* Page Header */}
        <section className="mb-14">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: 'var(--lhr-gray-blue)' }}
          >
            Apply
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Join{' '}
            <span style={{ color: 'var(--lhr-gold)' }}>Longhorn Racing.</span>
          </h1>
          <p className="font-urbanist text-[15px] text-white/40 max-w-lg leading-relaxed">
            Choose a team to apply for. Each team focuses on different aspects of racing vehicle design and engineering.
          </p>
          {/* Stripe accent */}
          <div className="flex gap-2 mt-8">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>
        </section>

        {/* Team Selection Cards */}
        <section className="mb-16">
          <div className="grid md:grid-cols-3 gap-4">
            {TEAM_INFO.map((teamInfo) => (
              <Link
                key={teamInfo.team}
                href={routes.applyTeam(teamInfo.team)}
                className="group relative rounded-xl overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${teamInfo.color}30`;
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                }}
              >
                {/* Team stripe */}
                <div className="h-1" style={{ backgroundColor: teamInfo.color }} />

                <div className="p-7">
                  {/* Team name + acronym */}
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold text-white">{teamInfo.name}</h2>
                    <span
                      className="text-[11px] font-semibold tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color: teamInfo.color,
                        backgroundColor: `${teamInfo.color}15`,
                      }}
                    >
                      {TEAM_ACRONYMS[teamInfo.name]}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="font-urbanist text-[14px] text-white/35 leading-relaxed mb-8">
                    {teamInfo.description}
                  </p>

                  {/* Apply link */}
                  <div
                    className="flex items-center gap-2 text-[13px] font-semibold tracking-wide"
                    style={{ color: teamInfo.color }}
                  >
                    <span>Apply</span>
                    <svg
                      className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Help link */}
        <section>
          <div
            className="rounded-xl p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <p className="text-[14px] font-semibold text-white mb-1">Not sure which team is right for you?</p>
              <p className="font-urbanist text-[13px] text-white/30">
                Learn about each team&apos;s focus areas, systems, and what they look for in applicants.
              </p>
            </div>
            <Link
              href="/teams"
              className="group inline-flex items-center gap-2 h-10 px-6 rounded-lg text-[13px] font-semibold tracking-wide shrink-0 transition-all duration-200"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              Explore Teams
              <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
