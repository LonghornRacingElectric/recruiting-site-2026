/**
 * Email template model for automated recruiting emails.
 * Templates are stored in Firestore under config/email_templates.
 */

export type EmailTrigger =
  | "interview_offered"
  | "trial_offered"
  | "accepted"
  | "rejected"
  | "waitlisted";

export interface EmailTemplate {
  id: string;
  trigger: EmailTrigger;
  name: string; // Human-readable name
  subject: string;
  body: string; // HTML body, supports {{variables}}
  enabled: boolean;
  updatedAt: Date;
  updatedBy: string;
}

export interface EmailTemplatesConfig {
  templates: EmailTemplate[];
  globalEnabled: boolean; // Master kill switch for all emails
  updatedAt: Date;
  updatedBy: string;
}

/**
 * Available template variables and their descriptions.
 */
export const TEMPLATE_VARIABLES: Record<string, string> = {
  applicantName: "Full name of the applicant",
  applicantFirstName: "First name of the applicant",
  applicantEmail: "Email address of the applicant",
  teamName: "Team name (Electric, Solar, Combustion)",
  systemNames: "Comma-separated list of offered systems",
  organizationName: "Longhorn Racing",
};

/**
 * Default email templates for each trigger.
 */
export const DEFAULT_EMAIL_TEMPLATES: Omit<EmailTemplate, "updatedAt" | "updatedBy">[] = [
  {
    id: "interview_offered",
    trigger: "interview_offered",
    name: "Interview Offered",
    subject: "🎉 Interview Invitation — Longhorn Racing {{teamName}}",
    body: `<p>Hi {{applicantFirstName}},</p>

<p>Congratulations! We're excited to invite you to interview for <strong>{{teamName}}</strong> at Longhorn Racing.</p>

<p>You've been selected to interview for the following system(s): <strong>{{systemNames}}</strong>.</p>

<p>Please log in to the <a href="https://recruiting.lhre.org/dashboard">recruiting portal</a> to view your interview details and schedule your time slot.</p>

<p>If you have any questions, don't hesitate to reach out.</p>

<p>Best regards,<br/>{{organizationName}} Recruiting Team</p>`,
    enabled: true,
  },
  {
    id: "trial_offered",
    trigger: "trial_offered",
    name: "Trial Workday Offered",
    subject: "🔧 Trial Workday Invitation — Longhorn Racing {{teamName}}",
    body: `<p>Hi {{applicantFirstName}},</p>

<p>Great news! You've been invited to a Trial Workday for <strong>{{teamName}}</strong> at Longhorn Racing.</p>

<p>You'll be working with the following system(s): <strong>{{systemNames}}</strong>.</p>

<p>Please visit the <a href="https://recruiting.lhre.org/dashboard">recruiting portal</a> for details about the trial workday including date, time, and location.</p>

<p>We look forward to seeing you there!</p>

<p>Best regards,<br/>{{organizationName}} Recruiting Team</p>`,
    enabled: true,
  },
  {
    id: "accepted",
    trigger: "accepted",
    name: "Accepted",
    subject: "🎊 Welcome to Longhorn Racing {{teamName}}!",
    body: `<p>Hi {{applicantFirstName}},</p>

<p>We're thrilled to let you know that you've been <strong>accepted</strong> to <strong>{{teamName}}</strong> at Longhorn Racing!</p>

<p>Welcome to the team! Please check the <a href="https://recruiting.lhre.org/dashboard">recruiting portal</a> for next steps and onboarding information.</p>

<p>We're excited to have you on board and can't wait to work with you.</p>

<p>Hook 'em! 🤘<br/>{{organizationName}} Recruiting Team</p>`,
    enabled: true,
  },
  {
    id: "rejected",
    trigger: "rejected",
    name: "Rejected",
    subject: "Longhorn Racing {{teamName}} — Application Update",
    body: `<p>Hi {{applicantFirstName}},</p>

<p>Thank you for your interest in <strong>{{teamName}}</strong> at Longhorn Racing and for the time you invested in the application process.</p>

<p>After careful consideration, we're unable to offer you a position on the team at this time. This was an extremely competitive cycle, and this decision does not reflect on your abilities.</p>

<p>We encourage you to apply again in the future, and we wish you the best in all your endeavors.</p>

<p>Best regards,<br/>{{organizationName}} Recruiting Team</p>`,
    enabled: true,
  },
  {
    id: "waitlisted",
    trigger: "waitlisted",
    name: "Waitlisted",
    subject: "Longhorn Racing {{teamName}} — Waitlist Update",
    body: `<p>Hi {{applicantFirstName}},</p>

<p>Thank you for applying to <strong>{{teamName}}</strong> at Longhorn Racing.</p>

<p>We wanted to let you know that you've been placed on our <strong>waitlist</strong>. This means we were impressed by your application, but we currently have limited spots available.</p>

<p>We will reach out if a position opens up. Please keep an eye on the <a href="https://recruiting.lhre.org/dashboard">recruiting portal</a> for any updates.</p>

<p>Best regards,<br/>{{organizationName}} Recruiting Team</p>`,
    enabled: true,
  },
];
