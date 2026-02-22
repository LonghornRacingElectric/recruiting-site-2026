import { requireStaff } from "@/lib/auth/guard";
import { getInterviewConfigsForUser } from "@/lib/actions/interview-config";
import { ConfigurationTabs } from "./ConfigurationTabs";
import { User, UserRole } from "@/lib/models/User";
import { listAccessibleCalendars } from "@/lib/google/calendar";
import { getTeamMembers } from "@/lib/actions/users";
import { Suspense } from "react";

export default async function ConfigurationPage() {
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
    <Suspense fallback={
      <div
        className="flex items-center justify-center p-12 h-full"
        style={{ background: '#030608' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="animate-spin h-5 w-5 rounded-full"
            style={{ border: '2px solid rgba(4,95,133,0.3)', borderTopColor: 'var(--lhr-blue)' }}
          />
          <span className="font-urbanist text-[13px] text-white/30">
            Loading configuration...
          </span>
        </div>
      </div>
    }>
      <ConfigurationTabs
        configs={configs}
        calendars={calendars}
        teamMembersMap={teamMembersMap}
        showCreateButton={showCreateButton}
        leadSystemMissing={!!leadSystemMissing}
        userData={userData}
      />
    </Suspense>
  );
}
