/**
 * High-level email sending functions that integrate templates with SES.
 * All functions are fire-and-forget safe — errors are logged but never thrown.
 */

import pino from "pino";
import { sendEmail } from "./ses";
import { renderTemplate, buildEmailVariables } from "./templates";
import { getEmailTemplatesConfig } from "@/lib/firebase/config";
import type { EmailTrigger, EmailTemplatesConfig } from "@/lib/models/EmailTemplate";

const logger = pino();

interface SendStatusEmailParams {
  trigger: EmailTrigger;
  applicantName: string;
  applicantEmail: string;
  teamName: string;
  systemNames?: string[];
  isFakeData?: boolean;
  config?: EmailTemplatesConfig; // Optional pre-loaded config
}

/**
 * Send a status-change email using the configured template.
 * This is the main entry point for all automated recruiting emails.
 *
 * Designed to be fire-and-forget: catches all errors internally.
 */
export async function sendStatusEmail(params: SendStatusEmailParams): Promise<void> {
  try {
    // SECURITY: Never send emails to fake accounts
    if (params.isFakeData || params.applicantEmail.includes(".fake")) {
      logger.info(
        { trigger: params.trigger, to: params.applicantEmail },
        "Skipping email to fake account"
      );
      return;
    }

    // Load email config from Firestore if not provided
    const config = params.config || await getEmailTemplatesConfig();

    // Check global kill switch
    if (!config.globalEnabled) {
      logger.info({ trigger: params.trigger }, "Email sending globally disabled, skipping");
      return;
    }

    // Find the template for this trigger
    const template = config.templates.find((t) => t.trigger === params.trigger);
    if (!template) {
      logger.warn({ trigger: params.trigger }, "No email template found for trigger");
      return;
    }

    // Check per-template enabled flag
    if (!template.enabled) {
      logger.info({ trigger: params.trigger }, "Email template disabled, skipping");
      return;
    }

    // Build variables and render
    const variables = buildEmailVariables({
      applicantName: params.applicantName,
      applicantEmail: params.applicantEmail,
      teamName: params.teamName,
      systemNames: params.systemNames,
    });

    const renderedSubject = renderTemplate(template.subject, variables);
    const renderedBody = renderTemplate(template.body, variables);

    // Wrap body in a styled HTML email layout
    const htmlBody = wrapInEmailLayout(renderedBody);

    // Send via SES - Use Team Name as the sender display name
    await sendEmail(params.applicantEmail, renderedSubject, htmlBody, `${params.teamName} Team`);

    logger.info(
      { trigger: params.trigger, to: params.applicantEmail, team: params.teamName },
      "Status email sent successfully"
    );
  } catch (error) {
    // Fire-and-forget: log errors but never throw
    logger.error(
      { trigger: params.trigger, to: params.applicantEmail, error },
      "Failed to send status email (non-blocking)"
    );
  }
}

/**
 * Send a test email (used by admins to preview templates).
 * Unlike sendStatusEmail, this DOES throw on failure so the admin can see errors.
 */
export async function sendTestEmail(params: {
  to: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
}): Promise<string | undefined> {
  const renderedSubject = renderTemplate(params.subject, params.variables);
  const renderedBody = renderTemplate(params.body, params.variables);
  const htmlBody = wrapInEmailLayout(renderedBody);

  return sendEmail(params.to, `[TEST] ${renderedSubject}`, htmlBody, "LHR Recruiting");
}

/**
 * Wrap raw HTML content in a responsive email-safe layout.
 */
function wrapInEmailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Longhorn Racing</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #bf5700 0%, #d4740a 100%); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                🤘 Longhorn Racing
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px; font-size: 15px; line-height: 1.7; color: #374151;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Longhorn Racing &bull; The University of Texas at Austin
              </p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #d1d5db;">
                This is an automated message from the recruiting portal.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
