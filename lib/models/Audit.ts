/**
 * Staff action audit log types (#119). Client-safe: no Firebase imports.
 * The writer and reader live in lib/firebase/audit.ts.
 */

export type AuditAction =
  | "application.status"
  | "application.reject"
  | "application.bulk"
  | "application.interview_offer"
  | "application.edit"
  | "application.note_deleted"
  | "application.export"
  | "application.seed"
  | "application.backfill_ratings"
  | "emails.trigger"
  | "config.recruiting_step"
  | "config.update"
  | "scorecard_config.update"
  | "user.update";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "application.status": "Status change",
  "application.reject": "Rejected",
  "application.bulk": "Bulk action",
  "application.interview_offer": "Interview offer updated",
  "application.edit": "Application edited",
  "application.note_deleted": "Note deleted",
  "application.export": "CSV export",
  "application.seed": "Seed data",
  "application.backfill_ratings": "Ratings backfill",
  "emails.trigger": "Emails sent",
  "config.recruiting_step": "Recruiting step",
  "config.update": "Config updated",
  "scorecard_config.update": "Scorecard config",
  "user.update": "User updated",
};

export interface AuditActor {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  team?: string;
  system?: string;
}

export interface AuditEntry {
  id?: string;
  at: Date;
  actor: AuditActor;
  action: AuditAction;
  /** `refused` = a rule stopped the actor; `error` = the request failed for another reason (not found, exception). */
  outcome: "ok" | "refused" | "error";
  /** Application acted on. Never the applicant's name or email. */
  applicationId?: string;
  applicantTeam?: string;
  /** For user.update: the user changed. */
  targetUid?: string;
  systems?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** One line a human can read without the before/after. */
  detail?: string;
  userAgent?: string;
}

/** Wire shape returned by the audit read routes (dates as ISO strings). */
export type AuditEntryDto = Omit<AuditEntry, "at"> & { at: string };
