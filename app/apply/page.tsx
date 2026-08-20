"use client";

import Link from "next/link";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";
import { useApplications } from "@/hooks/useApplications";
import { RecruitingStep } from "@/lib/models/Config";
import ApplicationsNotOpenNotice from "@/components/ApplicationsNotOpenNotice";
import BrandStripes from "@/components/BrandStripes";
import { BRAND_TEAM_COLORS, getBrandTeamInk } from "@/lib/teamColors";

const TEAM_ACRONYMS: Record<string, string> = {
  Electric: "LHRe",
  Solar: "LHRs",
  Combustion: "LHRc",
};

export default function ApplyPage() {
  const { recruitingStep, isLoading } = useApplications();
  const isPreOpen = !isLoading && recruitingStep === RecruitingStep.PRE_OPEN;

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        {/* Page Header */}
        <section className="mb-14 animate-fade-slide-up">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: 'var(--pub-text-3)' }}
          >
            Apply
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
            Join{' '}
            <span style={{ color: 'var(--pub-heading-accent)' }}>Longhorn Racing.</span>
          </h1>
          <p className="font-urbanist text-[15px] max-w-lg leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
            Choose a team to apply for. Each team focuses on different aspects of racing vehicle design and engineering.
          </p>
          {/* Stripe accent */}
          <BrandStripes className="mt-8" animated />
        </section>

        {/* Pre-open notice replaces the team cards until the cycle starts */}
        {isPreOpen && (
          <section className="mb-16">
            <ApplicationsNotOpenNotice />
          </section>
        )}

        {/* Team Selection Cards */}
        {!isPreOpen && (
        <section className="mb-16">
          <div className="grid md:grid-cols-3 gap-4">
            {TEAM_INFO.map((teamInfo) => {
              const brandColor = BRAND_TEAM_COLORS[teamInfo.name] || BRAND_TEAM_COLORS.Electric;
              return (
              <Link
                key={teamInfo.team}
                href={routes.applyTeam(teamInfo.team)}
                className="group relative rounded-xl overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor: 'var(--pub-surface)',
                  border: '1px solid var(--pub-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${brandColor}70`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--pub-border)';
                }}
              >
                {/* Team stripe */}
                <div className="h-1" style={{ backgroundColor: brandColor }} />

                <div className="p-7">
                  {/* Team name + acronym */}
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold" style={{ color: 'var(--pub-heading)' }}>{teamInfo.name}</h2>
                    <span
                      className="text-[11px] font-semibold tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color: getBrandTeamInk(teamInfo.name),
                        backgroundColor: `${brandColor}22`,
                      }}
                    >
                      {TEAM_ACRONYMS[teamInfo.name]}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="font-urbanist text-[14px] leading-relaxed mb-8" style={{ color: 'var(--pub-text-2)' }}>
                    {teamInfo.description}
                  </p>

                  {/* Apply link */}
                  <div
                    className="flex items-center gap-2 text-[13px] font-semibold tracking-wide"
                    style={{ color: getBrandTeamInk(teamInfo.name) }}
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
              );
            })}
          </div>
        </section>
        )}

        {/* Help link */}
        <section>
          <div
            className="rounded-xl p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            style={{
              backgroundColor: 'var(--pub-surface)',
              border: '1px solid var(--pub-border)',
            }}
          >
            <div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--pub-heading)' }}>Not sure which team is right for you?</p>
              <p className="font-urbanist text-[13px]" style={{ color: 'var(--pub-text-2)' }}>
                Learn about each team&apos;s focus areas, systems, and what they look for in applicants.
              </p>
            </div>
            <Link
              href="/teams"
              className="group inline-flex items-center gap-2 h-10 px-6 rounded-lg text-[13px] font-semibold tracking-wide shrink-0 transition-all duration-200"
              style={{
                backgroundColor: 'var(--pub-surface-2)',
                border: '1px solid var(--pub-border)',
                color: 'var(--pub-text)',
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
