import { getTeamsConfig } from "@/lib/firebase/config";
import BrandStripes from "@/components/BrandStripes";
import TeamsExplorer, { TeamView } from "./TeamsExplorer";

// Server component: team/subsystem content comes straight from Firestore and
// the first team's content renders in the initial HTML. Tab switching lives in
// TeamsExplorer (client).

export default async function TeamsPage() {
  const config = await getTeamsConfig();

  const teamOrder = ["Electric", "Solar", "Combustion"];
  const teams: TeamView[] = teamOrder
    .filter((t) => config.teams[t])
    .map((t) => ({
      name: config.teams[t].name,
      description: config.teams[t].description,
      subsystems: (config.teams[t].subsystems || []).map((s) => ({
        name: s.name,
        description: s.description,
      })),
    }));

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
            Our Teams
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--pub-heading)' }}>
            Three teams.{' '}
            <span style={{ color: 'var(--pub-heading-accent)' }}>One mission.</span>
          </h1>
          <p className="font-urbanist text-[15px] max-w-xl leading-relaxed" style={{ color: 'var(--pub-text-2)' }}>
            Longhorn Racing is divided into three specialized teams, each focused on a different powertrain technology. Explore our teams and their systems below.
          </p>
          {/* Stripe accent */}
          <BrandStripes className="mt-8" animated />
        </section>

        {/* Teams Content */}
        <section className="mb-20">
          {teams.length === 0 ? (
            <p className="font-urbanist text-[14px]" style={{ color: 'var(--pub-text-2)' }}>No team information available.</p>
          ) : (
            <TeamsExplorer teams={teams} />
          )}
        </section>
      </div>
    </main>
  );
}
