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

/**
 * Record many entries by one actor from one request — bulk actions — as
 * WriteBatch commits of up to 500, instead of N parallel adds on the slowest
 * route in the app. Never throws.
 */
export async function recordAuditMany(
  request: Request | null,
  actor: ActorInput,
  entries: Array<Omit<AuditEntry, "id" | "at" | "actor" | "outcome" | "userAgent"> & { outcome?: AuditEntry["outcome"] }>
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const who = await resolveActor(actor);
    const userAgent = request?.headers.get("user-agent")?.slice(0, 200) ?? undefined;
    for (let i = 0; i < entries.length; i += 500) {
      const batch = adminDb.batch();
      for (const entry of entries.slice(i, i + 500)) {
        batch.set(adminDb.collection(AUDIT_COLLECTION).doc(), clean({
          ...entry,
          outcome: entry.outcome ?? "ok",
          actor: who,
          userAgent,
          at: FieldValue.serverTimestamp(),
        }));
      }
      await batch.commit();
    }
  } catch (error) {
    logger.error({ err: error, count: entries.length, action: entries[0]?.action }, "Failed to write audit entries");
  }
}

/**
 * Which entries a team captain may see: their own team's applications, plus
 * CSV exports that included their team — the one action that moves applicant
 * data off-platform must not be invisible to the captain whose applicants
 * were in it.
 */
export function isVisibleToTeam(e: AuditEntry, team: string): boolean {
  if (e.applicantTeam === team) return true;
  const teams = (e.after as { teams?: unknown } | undefined)?.teams;
  return e.action === "application.export" && Array.isArray(teams) && teams.includes(team);
}

/** Newest-first window the feed reads before filtering in memory. */
export const AUDIT_FEED_WINDOW = 1000;

export interface ListAuditOptions {
  applicationId?: string;
  actorUid?: string;
  action?: AuditAction | string;
  /** Restrict to entries about this team's applications (captains). Entries with no application are excluded. */
  team?: string;
  limit?: number;
}

/**
 * Newest first. Every read is bounded by AUDIT_FEED_WINDOW — the feed by
 * `orderBy(at)`, the exact lookups (one application, one actor) by a plain
 * `limit` so they need no composite index. `truncated` is true whenever the
 * caller did not get everything that matched: the window filled, or more
 * matched than `limit` — the UI filters client-side over what it received,
 * and a filter over a silently truncated set looks like "nothing happened".
 */
export async function listAudit(opts: ListAuditOptions = {}): Promise<{ entries: AuditEntry[]; truncated: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  let docs;
  let truncated = false;
  if (opts.applicationId) {
    docs = (await adminDb.collection(AUDIT_COLLECTION).where("applicationId", "==", opts.applicationId).limit(AUDIT_FEED_WINDOW).get()).docs;
  } else if (opts.actorUid) {
    docs = (await adminDb.collection(AUDIT_COLLECTION).where("actor.uid", "==", opts.actorUid).limit(AUDIT_FEED_WINDOW).get()).docs;
  } else {
    docs = (await adminDb.collection(AUDIT_COLLECTION).orderBy("at", "desc").limit(AUDIT_FEED_WINDOW).get()).docs;
  }
  truncated = docs.length >= AUDIT_FEED_WINDOW;
  let entries: AuditEntry[] = docs.map((d) => {
    const data = d.data();
    return { ...(data as Omit<AuditEntry, "id" | "at">), id: d.id, at: data.at?.toDate?.() ?? new Date(0) } as AuditEntry;
  });
  if (opts.action) entries = entries.filter((e) => e.action === opts.action);
  if (opts.actorUid) entries = entries.filter((e) => e.actor?.uid === opts.actorUid);
  if (opts.team) entries = entries.filter((e) => isVisibleToTeam(e, opts.team!));
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  if (entries.length > limit) truncated = true;
  return { entries: entries.slice(0, limit), truncated };
}
