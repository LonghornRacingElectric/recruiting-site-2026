"use client";

import { useState } from "react";
import Link from "next/link";
import { TEAM_COLORS } from "@/lib/teamColors";

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

/**
 * Tabbed team browser. Content arrives as props from the server page so the
 * initial tab renders in the first HTML payload; this component only owns tab
 * switching and hover styling.
 */
export default function TeamsExplorer({ teams }: { teams: TeamView[] }) {
  const [activeTeam, setActiveTeam] = useState<string>(teams[0]?.name ?? "Electric");

  const active = teams.find((t) => t.name === activeTeam);
  const activeColor = TEAM_COLORS[activeTeam] || TEAM_COLORS.Electric;

  return (
    <>
      {/* Team Tabs */}
      <div className="flex gap-1.5 mb-10 flex-wrap">
        {teams.map((team) => {
          const color = TEAM_COLORS[team.name] || TEAM_COLORS.Electric;
          const isActive = activeTeam === team.name;
          return (
            <button
              key={team.name}
              onClick={() => setActiveTeam(team.name)}
              className="relative px-5 py-2.5 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200"
              style={{
                backgroundColor: isActive ? `${color}15` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? `${color}40` : 'rgba(255,255,255,0.06)'}`,
                color: isActive ? color : 'rgba(255,255,255,0.4)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                }
              }}
            >
              {team.name}
            </button>
          );
        })}
      </div>

      {/* Active Team Content */}
      {active && (
        <div key={activeTeam} className="animate-fade-slide-up" style={{ animationDuration: '0.35s' }}>
          {/* Team Description Card */}
          <div
            className="rounded-xl overflow-hidden mb-8"
            style={{
              backgroundColor: `${activeColor}06`,
              border: `1px solid ${activeColor}18`,
            }}
          >
            {/* Team stripe */}
            <div className="h-1" style={{ backgroundColor: activeColor }} />

            <div className="p-7">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-1 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: activeColor }}
                />
                <div>
                  <h3 className="text-xl font-bold text-white">
                    Longhorn Racing {activeTeam}
                  </h3>
                  <span
                    className="text-[11px] font-semibold tracking-wider"
                    style={{ color: activeColor }}
                  >
                    {TEAM_ACRONYMS[activeTeam]}
                  </span>
                </div>
              </div>
              <p className="font-urbanist text-[15px] text-white/50 leading-relaxed">
                {active.description}
              </p>
            </div>
          </div>

          {/* Subsystems */}
          <div className="mb-6">
            <p
              className="text-[12px] font-semibold tracking-widest uppercase mb-5"
              style={{ color: 'var(--lhr-gray-blue)' }}
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
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${activeColor}30`;
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                }}
              >
                <div className="p-5">
                  <h5 className="text-[14px] font-semibold text-white mb-2">{subsystem.name}</h5>
                  <p className="font-urbanist text-[13px] text-white/35 leading-relaxed">{subsystem.description}</p>
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
                color: '#000',
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
