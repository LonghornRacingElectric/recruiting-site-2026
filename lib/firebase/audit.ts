import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { getUser } from "./users";
import { logger } from "@/lib/logger";
import type { Application } from "@/lib/models/Application";
import type { User } from "@/lib/models/User";
import type { AuditAction, AuditActor, AuditEntry } from "@/lib/models/Audit";

export type { AuditAction, AuditActor, AuditEntry } from "@/lib/models/Audit";

/**
 * Staff action audit log (#119).
 *
 * Every mutating staff route records one entry per action: who (uid, email,
 * name, role, team/system), what (action + outcome), on which application
 * (id + team only — never an applicant's name or email, so the log is safe
 * for any staff member to read), and a compact before/after of the fields
 * that gate the pipeline. Refusals are recorded too: "who tried what" is
 * half of accountability.
 *
 * Writes never fail the request: a logging outage must not block a lead
 * from working, so recordAudit swallows its own errors (they still reach
 * error monitoring through logger.error).
 *
 * Reads are index-free on purpose: a single-field query plus in-memory
 * sort/filter over the most recent few hundred entries. This log is small
 * (hundreds of actions a day at peak) and a composite index would turn a
 * code change into a Firestore deploy.
 */

export const AUDIT_COLLECTION = "audit_log";

type ActorInput = AuditActor | User | { uid: string } | null | undefined;

async function resolveActor(input: ActorInput): Promise<AuditActor> {
  if (!input) return { uid: "unknown" };
  const anyInput = input as Partial<User> & Partial<AuditActor>;
  if (anyInput.email || anyInput.role || anyInput.name) {
    return {
      uid: anyInput.uid ?? "unknown",
      email: anyInput.email,
      name: anyInput.name,
      role: anyInput.role,
      team: anyInput.team ?? anyInput.memberProfile?.team,
      system: anyInput.system ?? anyInput.memberProfile?.system,
    };
  }
  // Only a uid: look the staff member up so the log reads as a person.
  try {
    const u = await getUser(anyInput.uid ?? "");
    if (u) return { uid: u.uid, email: u.email, name: u.name, role: u.role, team: u.memberProfile?.team, system: u.memberProfile?.system };
  } catch { /* fall through */ }
  return { uid: anyInput.uid ?? "unknown" };
}

/** The pipeline-gating fields, compact enough to diff by eye. */
export function snapshotApplication(app: Partial<Application> | null | undefined): Record<string, unknown> | undefined {
  if (!app) return undefined;
  return clean({
    status: app.status,
    reviewDecision: app.reviewDecision,
    interviewDecision: app.interviewDecision,
    trialDecision: app.trialDecision,
    trialDecisionDay: app.trialDecisionDay,
    preferredSystems: app.preferredSystems,
    rejectedBySystems: app.rejectedBySystems,
    interviewOffers: app.interviewOffers?.map((o) => `${o.system}:${o.status}`),
    trialOffers: app.trialOffers?.map((o) => `${o.system}:${o.status}${o.accepted === undefined ? "" : o.accepted ? ":accepted" : ":declined"}`),
    selectedInterviewSystem: app.selectedInterviewSystem,
    offerSystem: app.offer?.system,
    waitlistSystem: app.waitlistSystem,
  }) as Record<string, unknown>;
}

/** Firestore rejects undefined; strip it recursively (plain objects and arrays only). */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object" && !(value instanceof Date) && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

/** Record one staff action. Never throws. */
export async function recordAudit(
  request: Request | null,
  actor: ActorInput,
  entry: Omit<AuditEntry, "id" | "at" | "actor" | "outcome" | "userAgent"> & { outcome?: AuditEntry["outcome"] }
): Promise<void> {
  try {
    const who = await resolveActor(actor);
    const doc = clean({
      ...entry,
      outcome: entry.outcome ?? "ok",
      actor: who,
      userAgent: request?.headers.get("user-agent")?.slice(0, 200) ?? undefined,
      at: FieldValue.serverTimestamp(),
    });
    await adminDb.collection(AUDIT_COLLECTION).add(doc);
  } catch (error) {
    logger.error({ err: error, action: entry.action, applicationId: entry.applicationId }, "Failed to write audit entry");
  }
}

export interface ListAuditOptions {
  applicationId?: string;
  actorUid?: string;
  action?: AuditAction | string;
  /** Restrict to entries about this team's applications (captains). Entries with no application are excluded. */
  team?: string;
  limit?: number;
}

/** Newest first. */
export async function listAudit(opts: ListAuditOptions = {}): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  let docs;
  if (opts.applicationId) {
    docs = (await adminDb.collection(AUDIT_COLLECTION).where("applicationId", "==", opts.applicationId).get()).docs;
  } else if (opts.actorUid) {
    docs = (await adminDb.collection(AUDIT_COLLECTION).where("actor.uid", "==", opts.actorUid).get()).docs;
  } else {
    // Over-fetch so in-memory filters still fill the page.
    docs = (await adminDb.collection(AUDIT_COLLECTION).orderBy("at", "desc").limit(Math.max(limit * 3, 300)).get()).docs;
  }
  let entries: AuditEntry[] = docs.map((d) => {
    const data = d.data();
    return { ...(data as Omit<AuditEntry, "id" | "at">), id: d.id, at: data.at?.toDate?.() ?? new Date(0) } as AuditEntry;
  });
  if (opts.action) entries = entries.filter((e) => e.action === opts.action);
  if (opts.actorUid) entries = entries.filter((e) => e.actor?.uid === opts.actorUid);
  if (opts.team) entries = entries.filter((e) => e.applicantTeam === opts.team);
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  return entries.slice(0, limit);
}
