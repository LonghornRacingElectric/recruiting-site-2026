/**
 * The one place team colours are defined.
 *
 * Values come from the PM (2026 cycle): Azure Blue / Gold / Coral. Keyed by the
 * `Team` enum's string values so a plain team name works as a lookup.
 *
 * These are hex strings rather than CSS variables on purpose: several call sites
 * build translucent variants by suffixing alpha (`${color}15`), which only works
 * on a literal hex. The `--team-*` custom properties in globals.css mirror these
 * values for CSS-only usage — keep the two in sync.
 */
export const TEAM_COLORS: Record<string, string> = {
  Electric: "#3B82F6", // Azure Blue
  Solar: "#FACC15", // Gold
  Combustion: "#FB7185", // Coral
};

/** Team colour with a sensible fallback for unknown/missing teams. */
export function getTeamColor(team: string | undefined | null): string {
  return (team && TEAM_COLORS[team]) || "var(--lhr-blue)";
}
