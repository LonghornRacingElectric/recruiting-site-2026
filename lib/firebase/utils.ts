/**
 * Slugify a team name for document IDs or config keys.
 * Lowercases and collapses spaces to hyphens (e.g., "Electric" -> "electric").
 */
export function slugifyTeam(team: string | undefined | null): string {
  if (!team) return '';
  return team.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Slugify a system name for use in Firestore document IDs or field names.
 * Lowercases, drops ampersands, and collapses spaces/slashes to hyphens —
 * e.g. "Vehicle Modeling & Software" → "vehicle-modeling-software",
 * "Sim/Val" → "sim-val". Ampersands must not reach doc IDs or URL params.
 */
export function slugifySystem(name: string | undefined | null): string {
  if (!name) return '';
  return name.toLowerCase().replace(/&/g, '').replace(/[\s/]+/g, '-');
}

/**
 * Generate a composite key for a team and system combo.
 * Format: {teamSlug}-{systemSlug} (e.g., "electric-aerodynamics").
 */
export function generateTeamSystemKey(team: string | undefined | null, system: string | undefined | null): string {
  const t = slugifyTeam(team);
  const s = slugifySystem(system);
  if (!t) return s;
  if (!s) return t;
  return `${t}-${s}`;
}
