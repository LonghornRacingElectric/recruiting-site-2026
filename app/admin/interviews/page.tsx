import { requireStaff } from "@/lib/auth/guard";
import { getInterviewConfigsForUser } from "@/lib/actions/interview-config";
import { InterviewConfigForm } from "./InterviewConfigForm";
import { CreateConfigModal } from "./CreateConfigModal";
import { User, UserRole } from "@/lib/models/User";
import { InterviewSlotConfig } from "@/lib/models/Interview";
import { listAccessibleCalendars } from "@/lib/google/calendar";
import { getTeamMembers } from "@/lib/actions/users";
import { InitializeSystemButton } from "./InitializeSystemButton";

export default async function InterviewsPage() {
  const { uid, user } = await requireStaff();
  const userData = user as User;

  // Fetch configs accessible to this user
  const configs = await getInterviewConfigsForUser(uid);

  // Fetch data for the form (calendars, users)
  let calendars: { id: string; summary: string }[] = [];
  try {
    calendars = await listAccessibleCalendars();
  } catch (e) {
    console.error("Failed to list calendars:", e);
  }

  // Determine permissions
  const canCreateAny = userData.role === UserRole.ADMIN;
  const canCreateTeam = userData.role === UserRole.TEAM_CAPTAIN_OB;
  const isLead = userData.role === UserRole.SYSTEM_LEAD;

  const showCreateButton = canCreateAny || canCreateTeam;

  // For System Leads, check if their specific system is missing
  const leadSystemMissing = isLead && userData.memberProfile && !configs.some(
    c => c.system === userData.memberProfile?.system
  );

  // Fetch members for relevant teams
  const relevantTeams = new Set<string>();
  if (userData.memberProfile?.team) {
    relevantTeams.add(userData.memberProfile.team);
  }
  // Also add teams from existing configs (for admins who might see many)
  configs.forEach(c => relevantTeams.add(c.team));

  const teamMembersMap: Record<string, User[]> = {};
  for (const team of relevantTeams) {
    // @ts-ignore
    teamMembersMap[team] = await getTeamMembers(team);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Interview Configuration</h1>
          <p className="text-neutral-400">
            Manage interview settings, interviewers, and availability.
          </p>
        </div>

        {showCreateButton && (
          <CreateConfigModal
            existingConfigs={configs}
            userRole={userData.role}
            userTeam={userData.memberProfile?.team}
          />
        )}
      </div>

      {configs.length === 0 && !leadSystemMissing && !showCreateButton && (
        <div className="p-4 rounded-lg bg-neutral-900 border border-white/10 text-neutral-400">
          You do not have access to any interview configurations.
        </div>
      )}

      {leadSystemMissing && userData.memberProfile && (
         <div className="p-6 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-between">
           <div>
             <h3 className="text-lg font-semibold text-orange-500 mb-1">Configuration Missing</h3>
             <p className="text-neutral-400 text-sm">
               The interview configuration for <span className="text-white font-medium">{userData.memberProfile.system}</span> has not been initialized.
             </p>
           </div>
           <InitializeSystemButton
             team={userData.memberProfile.team}
             system={userData.memberProfile.system as string}
           />
         </div>
      )}

      <div className="grid gap-8">
        {configs.map((config) => (
          <InterviewConfigForm
            key={config.id}
            config={config}
            calendars={calendars}
            availableUsers={teamMembersMap[config.team] || []}
          />
        ))}
      </div>
    </div>
  );
}
