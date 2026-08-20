"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND_TEAM_COLORS, getBrandTeamInk } from "@/lib/teamColors";

export interface TeamView {
  name: string;
  description: string;
  subsystems: { name: string; description: string }[];
}

const TEAM_ACRONYMS: Record<string, string> = {
  Electric: "LHRe",
  Solar: "LHRs",
  Combustion: "LHRc",
};

// Vehicle photos (public/teams/) — shared with the home page team tiles.
const TEAM_IMAGES: Record<string, string> = {
  Electric: "/teams/electric.avif",
  Solar: "/teams/solar.avif",
  Combustion: "/teams/combustion.avif",
};

// Admins separate paragraphs in the config textareas with single newlines,
// so treat any run of newlines as a paragraph break.
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Tabbed team browser. Content arrives as props from the server page so the
 * initial tab renders in the first HTML payload; this component only owns tab
 * switching and hover styling. Accents use the brand-book team ambers
 * (BRAND_TEAM_COLORS) for stripes/tints and theme-aware inks for text.
 */
export default function TeamsExplorer({
  teams,
  initialTeam,
}: {
  teams: TeamView[];
  /** Optional team name (case-insensitive) to pre-select, e.g. from ?team= */
  initialTeam?: string;
}) {
  const [activeTeam, setActiveTeam] = useState<string>(() => {
    const match =
      initialTeam && teams.find((t) => t.name.toLowerCase() === initialTeam.toLowerCase());
    return match ? match.name : (teams[0]?.name ?? "Electric");
  });

  const active = teams.find((t) => t.name === activeTeam);
  const activeIndex = Math.max(0, teams.findIndex((t) => t.name === activeTeam));
  const activeColor = BRAND_TEAM_COLORS[activeTeam] || BRAND_TEAM_COLORS.Electric;
  const activeInk = getBrandTeamInk(activeTeam);

  return (
    <>
      {/* Team switcher — a segmented control (label + shared track + pressed-in
          active state) so the three options clearly read as clickable tabs,
          not decorative pills. */}
      <div className="mb-10">
        <p
          className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
          style={{ color: 'var(--pub-text-3)' }}
        >
          Choose a team
        </p>
        <div
          role="tablist"
          aria-label="Teams"
          className="relative grid gap-1 p-1 rounded-xl w-full max-w-md"
          style={{
            backgroundColor: 'var(--pub-surface-2)',
            border: '1px solid var(--pub-border)',
            gridTemplateColumns: `repeat(${teams.length}, 1fr)`,
          }}
        >
          {/* Sliding thumb — one segment wide, glides to the active column and
              tints toward that team's amber. Width accounts for the track's
              4px padding and the 4px gaps between segments. */}
          <div
            aria-hidden="true"
            className="absolute top-1 bottom-1 rounded-lg pointer-events-none"
            style={{
              left: '4px',
              width: `calc((100% - 8px - ${(teams.length - 1) * 4}px) / ${teams.length})`,
              transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
              backgroundColor: `${activeColor}1E`,
              border: `1px solid ${activeColor}55`,
              boxShadow: '0 2px 8px rgba(3,16,26,0.18)',
              transition:
                'transform 0.35s cubic-bezier(0.22,1,0.36,1), background-color 0.35s ease, border-color 0.35s ease',
            }}
          />
          {teams.map((team) => {
            const isActive = activeTeam === team.name;
            return (
              <button
                key={team.name}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTeam(team.name)}
                className="relative z-[1] flex items-center justify-center px-3 sm:px-6 py-2.5 rounded-lg text-[13px] sm:text-[14px] font-semibold transition-colors duration-200 cursor-pointer"
                style={{
                  color: isActive ? getBrandTeamInk(team.name) : 'var(--pub-text-2)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--pub-heading)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--pub-text-2)';
                }}
              >
                {team.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Team Content */}
      {active && (
        <div key={activeTeam} className="animate-fade-slide-up" style={{ animationDuration: '0.35s' }}>
          {/* Team Description Card */}
          <div
            className="rounded-xl overflow-hidden mb-8"
            style={{
              backgroundColor: `${activeColor}0A`,
              border: `1px solid ${activeColor}40`,
            }}
          >
            {/* Team stripe */}
            <div className="h-1" style={{ backgroundColor: activeColor }} />

            {/* Team vehicle photo */}
            {TEAM_IMAGES[activeTeam] && (
              <div
                className="relative h-52 md:h-64 overflow-hidden"
                style={{ borderBottom: `1px solid ${activeColor}40` }}
              >
                <Image
                  src={TEAM_IMAGES[activeTeam]}
                  alt={`Longhorn Racing ${activeTeam} vehicle`}
                  fill
                  sizes="(min-width: 1152px) 1152px, 100vw"
                  className="object-cover"
                />
              </div>
            )}

            <div className="p-7">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-1 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: activeColor }}
                />
                <div>
                  <h3 className="text-xl font-bold" style={{ color: 'var(--pub-heading)' }}>
                    Longhorn Racing {activeTeam}
                  </h3>
                  <span
                    className="text-[11px] font-semibold tracking-wider"
                    style={{ color: activeInk }}
                  >
                    {TEAM_ACRONYMS[activeTeam]}
                  </span>
                </div>
              </div>
              <div className="font-urbanist text-[15px] leading-relaxed space-y-3" style={{ color: 'var(--pub-text)' }}>
                {splitParagraphs(active.description).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Subsystems */}
          <div className="mb-6">
            <p
              className="text-[12px] font-semibold tracking-widest uppercase mb-5"
              style={{ color: 'var(--pub-text-3)' }}
            >
              Systems &amp; Sub-Teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.subsystems.map((subsystem, index) => (
              <div
                key={index}
                className="group rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: 'var(--pub-surface)',
                  border: '1px solid var(--pub-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${activeColor}70`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--pub-border)';
                }}
              >
                <div className="p-5">
                  <h5 className="text-[14px] font-semibold mb-2" style={{ color: 'var(--pub-heading)' }}>{subsystem.name}</h5>
                  <div className="font-urbanist text-[13px] leading-relaxed space-y-2" style={{ color: 'var(--pub-text-2)' }}>
                    {splitParagraphs(subsystem.description).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Apply CTA */}
          <div className="mt-10 flex items-center gap-4">
            <Link
              href={`/apply/${activeTeam.toLowerCase()}`}
              className="group inline-flex items-center gap-2 h-11 px-7 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{
                backgroundColor: activeColor,
                color: 'var(--pub-cta-ink)',
              }}
            >
              Apply to {activeTeam}
              <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
