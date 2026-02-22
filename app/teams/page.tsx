"use client";

import { useEffect, useState } from "react";
import { TeamDescription } from "@/lib/models/Config";
import Link from "next/link";

interface TeamsData {
  teams: Record<string, TeamDescription>;
}

const TEAM_COLORS: Record<string, string> = {
  Electric: "#FFB526",
  Solar: "#FF9404",
  Combustion: "#FFC871",
};

const TEAM_ACRONYMS: Record<string, string> = {
  Electric: "LHRe",
  Solar: "LHRs",
  Combustion: "LHRc",
};

export default function TeamsPage() {
  const [teamsData, setTeamsData] = useState<TeamsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTeam, setActiveTeam] = useState<string>("Electric");

  useEffect(() => {
    async function fetchTeams() {
      try {
        const response = await fetch("/api/teams");
        if (response.ok) {
          const data = await response.json();
          setTeamsData(data);
          const teamNames = Object.keys(data.teams);
          if (teamNames.length > 0) {
            setActiveTeam(teamNames[0]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch teams:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTeams();
  }, []);

  const teamOrder = ["Electric", "Solar", "Combustion"];
  const sortedTeams = teamsData
    ? teamOrder.filter(t => teamsData.teams[t]).map(t => teamsData.teams[t])
    : [];

  const activeColor = TEAM_COLORS[activeTeam] || TEAM_COLORS.Electric;

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
            Our Teams
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Three teams.{' '}
            <span style={{ color: 'var(--lhr-gold)' }}>One mission.</span>
          </h1>
          <p className="font-urbanist text-[15px] text-white/40 max-w-xl leading-relaxed">
            Longhorn Racing is divided into three specialized teams, each focused on a different powertrain technology. Explore our teams and their systems below.
          </p>
          {/* Stripe accent */}
          <div className="flex gap-2 mt-8">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>
        </section>

        {/* Teams Content */}
        <section className="mb-20">
          {loading ? (
            <div className="animate-pulse flex flex-col gap-4 max-w-6xl">
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 w-28 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
              <div className="h-32 w-full rounded-xl mt-4" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }} />
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-28 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }} />
                ))}
              </div>
            </div>
          ) : sortedTeams.length === 0 ? (
            <p className="font-urbanist text-[14px] text-white/40">No team information available.</p>
          ) : (
            <>
              {/* Team Tabs */}
              <div className="flex gap-1.5 mb-10 flex-wrap">
                {sortedTeams.map((team) => {
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
              {teamsData?.teams[activeTeam] && (
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
                        {teamsData.teams[activeTeam].description}
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
                    {teamsData.teams[activeTeam].subsystems.map((subsystem, index) => (
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
          )}
        </section>
      </div>
    </main>
  );
}
