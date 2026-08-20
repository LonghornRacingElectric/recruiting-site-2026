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

/**
 * Brand-book team accents (Brand Book §D, "Team Colors"): each team owns one
 * shade of the amber family. Used on PUBLIC/applicant surfaces for stripes,
 * tints, and badges so the outside-facing site matches org branding; the
 * admin console keeps the high-contrast TEAM_COLORS above for at-a-glance
 * differentiation. Hex literals (not CSS vars) because call sites build
 * translucent variants by suffixing alpha (`${color}15`).
 */
export const BRAND_TEAM_COLORS: Record<string, string> = {
  Electric: "#FFB526", // Mid amber
  Solar: "#FF9404", // Deep orange
  Combustion: "#FFC871", // Light amber
};

/** Brand team accent with a fallback for unknown/missing teams. */
export function getBrandTeamColor(team: string | undefined | null): string {
  return (team && BRAND_TEAM_COLORS[team]) || "#FFB526";
}

/**
 * Theme-aware readable text colour for a team (amber text fails contrast on
 * light backgrounds, so light mode swaps in darkened variants). Resolves to
 * the --team-<team>-ink custom properties defined in globals.css.
 */
export function getBrandTeamInk(team: string | undefined | null): string {
  const slug = (team || "").toLowerCase();
  return ["electric", "solar", "combustion"].includes(slug)
    ? `var(--team-${slug}-ink)`
    : "var(--pub-heading-accent)";
}
