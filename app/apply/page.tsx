"use client";

import Link from "next/link";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Join <span className="text-[#FFB526]">Longhorn Racing</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
            Choose a team to apply for. Each team focuses on different aspects
            of racing vehicle design and engineering.
          </p>
        </div>

        {/* Team Selection Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TEAM_INFO.map((teamInfo) => (
            <Link
              key={teamInfo.team}
              href={routes.applyTeam(teamInfo.team)}
              className="group relative p-8 rounded-2xl bg-neutral-900 border border-white/5 hover:border-opacity-50 transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl"
              style={
                {
                  "--team-color": teamInfo.color,
                } as React.CSSProperties
              }
            >
              {/* Gradient overlay on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-300"
                style={{ backgroundColor: teamInfo.color }}
              />

              {/* Icon */}
              <div className="text-5xl mb-4">{teamInfo.icon}</div>

              {/* Team Name */}
              <h2
                className="text-2xl font-bold text-white mb-3 group-hover:transition-colors duration-300"
                style={{ color: teamInfo.color }}
              >
                {teamInfo.name}
              </h2>

              {/* Description */}
              <p className="text-neutral-400 text-sm leading-relaxed mb-6">
                {teamInfo.description}
              </p>

              {/* Apply Button */}
              <div
                className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: teamInfo.color }}
              >
                Apply Now
                <svg
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-16 text-center">
          <p className="text-neutral-500 text-sm">
            Not sure which team is right for you?{" "}
            <Link href="/about" className="text-[#FFB526] hover:underline">
              Learn more about our teams
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
