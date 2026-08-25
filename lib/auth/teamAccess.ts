import { Team, UserRole } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";

/**
 * Check if a staff user has team-based access to an application.
 * Returns null if access is allowed, or an error message string if denied.
 * 
 * - ADMIN: always allowed
 * - TEAM_CAPTAIN_OB: must be on the same team
 * - SYSTEM_LEAD / REVIEWER: must be on the same team AND system in preferredSystems
 */
const STAFF_ROLES: UserRole[] = [
    UserRole.ADMIN,
    UserRole.TEAM_CAPTAIN_OB,
    UserRole.SYSTEM_LEAD,
    UserRole.REVIEWER,
];

export function checkTeamAccess(user: any, application: Application): string | null {
    // Staff only. Without this gate every role the checks below don't name —
    // APPLICANT above all — falls through to the closing `return null`, and a
    // member of one team applying to another carries a memberProfile that
    // satisfies the team check. The notes and tasks routes use this function as
    // their only authorization, so the gate has to live here.
    if (!STAFF_ROLES.includes(user?.role)) {
        return "Forbidden: Staff access required";
    }

    // Admins can access any application
    if (user?.role === UserRole.ADMIN) {
        return null;
    }

    const userTeam = user?.memberProfile?.team;
    const userSystem = user?.memberProfile?.system;

    // All non-admin staff must be on the same team
    if (!userTeam || userTeam !== application.team) {
        return "Forbidden: You do not have access to this application";
    }

    // Team captains can access any application on their team
    if (user?.role === UserRole.TEAM_CAPTAIN_OB) {
        return null;
    }

    // System leads and reviewers must also have their system in preferredSystems
    if (user?.role === UserRole.SYSTEM_LEAD || user?.role === UserRole.REVIEWER) {
        const appSystems = application.preferredSystems || [];
        if (!userSystem || !appSystems.includes(userSystem)) {
            return "Forbidden: You do not have access to this application";
        }
    }

    return null;
}

/**
 * Resolve which system a staff user may read or write a scorecard for.
 * Returns the resolved system, or an error message if the caller asked for one
 * they may not touch.
 *
 * Admins and team captains work across the whole team, so they may name any
 * system that team actually has, and default to the applicant's first choice.
 * System leads and reviewers are pinned to their own system.
 *
 * That pinning is the point: `system` used to arrive from the query string or
 * request body unchecked and flow straight into the scorecard document id and
 * into updateAggregateRating, so a reviewer with legitimate access to an
 * application could drop a score into a different system's pool and move that
 * system's aggregate for the candidate.
 */
export function resolveScorecardSystem(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: any,
    application: Application,
    requestedSystem: string | null | undefined
): { system?: string; error?: string } {
    const requested = requestedSystem || undefined;
    const isHighPrivileged =
        user?.role === UserRole.ADMIN || user?.role === UserRole.TEAM_CAPTAIN_OB;

    if (!isHighPrivileged) {
        const ownSystem = user?.memberProfile?.system;
        if (!ownSystem) {
            return { error: "Your account has no system assigned. Ask an admin to set your system." };
        }
        if (requested && requested !== ownSystem) {
            return { error: `Forbidden: You can only score your own system (${ownSystem})` };
        }
        return { system: ownSystem };
    }

    const teamSystems = (TEAM_SYSTEMS[application.team as Team] || []).map((s) => s.value);
    if (requested && !teamSystems.includes(requested)) {
        return { error: `Invalid system for team ${application.team}` };
    }
    return { system: requested ?? application.preferredSystems?.[0] };
}
