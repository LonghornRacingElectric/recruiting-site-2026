import { getTeamsConfig } from "@/lib/firebase/config";
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
          {teams.length === 0 ? (
            <p className="font-urbanist text-[14px] text-white/40">No team information available.</p>
          ) : (
            <TeamsExplorer teams={teams} />
          )}
        </section>
      </div>
    </main>
  );
}
