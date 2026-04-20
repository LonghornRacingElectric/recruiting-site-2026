/**
 * Template rendering engine for email templates.
 * Replaces {{variable}} placeholders with actual values.
 */

/**
 * Render a template string by replacing {{variable}} placeholders with values.
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Key-value map of variable names to their values
 * @returns Rendered template string
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Build the standard variable map for an applicant email.
 */
export function buildEmailVariables(params: {
  applicantName: string;
  applicantEmail: string;
  teamName: string;
  systemNames?: string[];
}): Record<string, string> {
  const firstName = params.applicantName.split(" ")[0] || params.applicantName;

  return {
    applicantName: params.applicantName,
    applicantFirstName: firstName,
    applicantEmail: params.applicantEmail,
    teamName: params.teamName,
    systemNames: params.systemNames?.join(", ") || "General",
    organizationName: "Longhorn Racing",
  };
}
