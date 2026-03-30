import { UserRole } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";

/**
 * Check if a staff user has team-based access to an application.
 * Returns null if access is allowed, or an error message string if denied.
 * 
 * - ADMIN: always allowed
 * - TEAM_CAPTAIN_OB: must be on the same team
 * - SYSTEM_LEAD / REVIEWER: must be on the same team AND system in preferredSystems
 */
export function checkTeamAccess(user: any, application: Application): string | null {
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
