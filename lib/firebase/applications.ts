import { adminDb } from "@/lib/firebase/admin";
import {
  Application,
  ApplicationCreateData,
  ApplicationFormData,
  ApplicationStatus,
  InterviewOffer,
  InterviewEventStatus,
  TrialOffer,
} from "@/lib/models/Application";
import { Team, ElectricSystem, SolarSystem, CombustionSystem } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { FieldValue } from "firebase-admin/firestore";

const APPLICATIONS_COLLECTION = "applications";
const USERS_COLLECTION = "users";

/**
 * Helper to safely convert a Firestore timestamp or date value to a Date
 */
function safeToDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  
  // Firestore Timestamp with toDate method
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  
  // Already a Date
  if (value instanceof Date) {
    return value;
  }
  
  // ISO string or other parseable format
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Fallback for unparseable values
  return undefined;
}

/**
 * Helper to convert Firestore timestamps in InterviewOffer to Dates
 */
function convertInterviewOfferDates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any
): InterviewOffer {
  return {
    ...offer,
    createdAt: safeToDate(offer.createdAt) || new Date(),
    cancelledAt: safeToDate(offer.cancelledAt),
  };
}

/**
 * Helper to remove undefined values from an object before writing to Firestore.
 * Firestore doesn't accept undefined values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Prepare an InterviewOffer for writing to Firestore by stripping undefined values
 */
function prepareOfferForFirestore(offer: InterviewOffer): Record<string, unknown> {
  return stripUndefined({
    system: offer.system,
    status: offer.status,
    createdAt: offer.createdAt,
    cancelledAt: offer.cancelledAt,
    cancelReason: offer.cancelReason,
  });
}

/**
 * Create a new in-progress application for a user and team.
 * If an application already exists for this user and team, returns the existing one.
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function createApplication(
  data: ApplicationCreateData
): Promise<Application> {
  // Use transaction to atomically check for existing and create if not exists
  return await adminDb.runTransaction(async (transaction) => {
    // Check if user already has an application for this team (within transaction)
    const existingSnapshot = await transaction.get(
      adminDb
        .collection(APPLICATIONS_COLLECTION)
        .where("userId", "==", data.userId)
        .where("team", "==", data.team)
        .limit(1)
    );

    if (!existingSnapshot.empty) {
      // Return existing application
      const doc = existingSnapshot.docs[0];
      const existingData = doc.data();
      return {
        ...existingData,
        id: doc.id,
        createdAt: existingData.createdAt?.toDate() || new Date(),
        updatedAt: existingData.updatedAt?.toDate() || new Date(),
        submittedAt: existingData.submittedAt?.toDate(),
        lastEditAt: safeToDate(existingData.lastEditAt),
        interviewOffers: normalizeInterviewOffers(existingData.interviewOffers),
      } as Application;
    }

    // No existing application - create new one
    const now = new Date();
    const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc();
    const application: Application = {
      id: applicationRef.id,
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail,
      team: data.team,
      status: ApplicationStatus.IN_PROGRESS,
      createdAt: now,
      updatedAt: now,
      formData: {},
    };

    // Create the application document
    transaction.set(applicationRef, {
      ...application,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Add the application ID to the user's applications array
    const userRef = adminDb.collection(USERS_COLLECTION).doc(data.userId);
    transaction.update(userRef, {
      applications: FieldValue.arrayUnion(applicationRef.id),
    });

    return application;
  });
}

/**
 * Get a single application by ID
 */
export async function getApplication(
  applicationId: string
): Promise<Application | null> {
  const doc = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .doc(applicationId)
    .get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
    submittedAt: data.submittedAt?.toDate(),
    interviewOffers: normalizeInterviewOffers(data.interviewOffers),
  } as Application;
}

/**
 * Get all applications for a specific user
 */
export async function getUserApplications(
  userId: string
): Promise<Application[]> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("userId", "==", userId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
      submittedAt: data.submittedAt?.toDate(),
      interviewOffers: normalizeInterviewOffers(data.interviewOffers),
    } as Application;
  });
}

/**
 * Helper to normalize interviewOffers - handles both array and single object forms
 */
function normalizeInterviewOffers(offers: unknown): InterviewOffer[] | undefined {
  if (!offers) return undefined;
  
  // Already an array
  if (Array.isArray(offers)) {
    return offers.map(convertInterviewOfferDates);
  }
  
  // Single object - wrap in array
  if (typeof offers === 'object') {
    return [convertInterviewOfferDates(offers)];
  }
  
  return undefined;
}

/**
 * Helper to normalize trialOffers - handles both array and single object forms
 */
function normalizeTrialOffers(offers: unknown): TrialOffer[] | undefined {
  if (!offers) return undefined;
  
  // Already an array
  if (Array.isArray(offers)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return offers.map((offer: any) => ({
      ...offer,
      createdAt: safeToDate(offer.createdAt) || new Date(),
    }));
  }
  
  // Single object - wrap in array
  if (typeof offers === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offer = offers as any;
    return [{
      ...offer,
      createdAt: safeToDate(offer.createdAt) || new Date(),
    }];
  }
  
  return undefined;
}

/**
 * Get a user's application for a specific team
 */
export async function getUserApplicationForTeam(
  userId: string,
  team: Team
): Promise<Application | null> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("userId", "==", userId)
    .where("team", "==", team)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
    submittedAt: data.submittedAt?.toDate(),
    interviewOffers: normalizeInterviewOffers(data.interviewOffers),
  } as Application;
}

/**
 * Update an application's form data and other fields
 */
export async function updateApplication(
  applicationId: string,
  updates: Partial<Pick<Application, "formData" | "preferredSystems" | "originalPreferredSystems" | "status" | "interviewOffers" | "selectedInterviewSystem" | "rejectedBySystems" | "trialOffers" | "reviewDecision" | "interviewDecision" | "trialDecision" | "trialDecisionDay" | "offer" | "waitlistSystem" | "emailsSent" | "lastEditSession" | "lastEditAt">>
): Promise<Application | null> {
  const applicationRef = adminDb
    .collection(APPLICATIONS_COLLECTION)
    .doc(applicationId);

  const doc = await applicationRef.get();
  if (!doc.exists) {
    return null;
  }

  // Prepare update data, stripping undefined from interviewOffers
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // If interviewOffers is being updated (including to empty array), strip undefined values from each offer
  if (Array.isArray(updates.interviewOffers)) {
    updateData.interviewOffers = updates.interviewOffers.map(prepareOfferForFirestore);
  }

  // Setting SUBMITTED stamps submittedAt — on first submission and on every
  // applicant edit afterwards, so staff see the date of the version in front
  // of them (the applicant route relies on this). Staff reverts go through
  // revertToSubmitted, which keeps the original date (#108).
  if (updates.status === ApplicationStatus.SUBMITTED) {
    updateData.submittedAt = FieldValue.serverTimestamp();
  }

  await applicationRef.update(updateData);

  return getApplication(applicationId);
}

/**
 * Update just the form data of an application (merge with existing)
 */
/** Thrown when a guarded update finds the application changed since it was loaded (#66). */
export class ApplicationConflictError extends Error {
  constructor() {
    super("This application changed while you were deciding — reload and try again");
    this.name = "ApplicationConflictError";
  }
}

/**
 * updateApplication, guarded (#66): the write only lands if the application's
 * status is still what the caller loaded. Two staff deciding on one applicant
 * at the same moment used to be last-write-wins with two 200s; now the
 * second gets a conflict and reloads.
 */
export async function updateApplicationIfUnchanged(
  applicationId: string,
  updates: Parameters<typeof updateApplication>[1],
  expect: { status: ApplicationStatus }
): Promise<Application | null> {
  const ref = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);
  const found = await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) return false;
    if (doc.data()!.status !== expect.status) throw new ApplicationConflictError();
    const updateData: Record<string, unknown> = { ...updates, updatedAt: FieldValue.serverTimestamp() };
    if (Array.isArray(updates.interviewOffers)) {
      updateData.interviewOffers = updates.interviewOffers.map(prepareOfferForFirestore);
    }
    if (updates.status === ApplicationStatus.SUBMITTED) {
      updateData.submittedAt = FieldValue.serverTimestamp();
    }
    transaction.update(ref, updateData);
    return true;
  });
  return found ? getApplication(applicationId) : null;
}

/**
 * Record a sent email without rewriting the whole list (#64): two runs, or a
 * run working from a list read minutes earlier, can no longer drop each
 * other's entries.
 */
export async function markEmailSent(applicationId: string, trigger: string): Promise<void> {
  await adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId).update({
    emailsSent: FieldValue.arrayUnion(trigger),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function updateApplicationFormData(
  applicationId: string,
  formData: Partial<ApplicationFormData>,
  extra: Partial<Pick<Application, "lastEditSession" | "lastEditAt">> = {}
): Promise<Application | null> {
  const application = await getApplication(applicationId);
  if (!application) {
    return null;
  }

  const mergedFormData = {
    ...application.formData,
    ...formData,
  };

  return updateApplication(applicationId, { formData: mergedFormData, ...extra });
}

/**
 * Add an interview offer to an application.
 * This is typically called by an admin/reviewer when extending an interview.
 * The system parameter is the name of the system offering the interview (e.g., "Electronics").
 * Calendar and interviewer info is looked up from interviewConfigs when scheduling.
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function addInterviewOffer(
  applicationId: string,
  system: string
): Promise<Application | null> {
  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const existingOffers = normalizeInterviewOffers(data.interviewOffers) || [];

    // Check if offer for this system already exists
    if (existingOffers.some((o) => o.system === system)) {
      throw new Error(`Interview offer for ${system} already exists`);
    }

    const newOffer: InterviewOffer = {
      system,
      status: InterviewEventStatus.PENDING,
      createdAt: new Date(),
    };

    const updatedOffers = [...existingOffers, newOffer];

    // Prepare update data
    const updateData: Record<string, unknown> = {
      interviewOffers: updatedOffers.map(prepareOfferForFirestore),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Also update status to INTERVIEW if not already
    if (data.status !== ApplicationStatus.INTERVIEW) {
      updateData.status = ApplicationStatus.INTERVIEW;
    }

    transaction.update(applicationRef, updateData);

    // Return the updated application data
    return {
      ...data,
      id: doc.id,
      interviewOffers: updatedOffers,
      status: updateData.status || data.status,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });
}

/**
 * Add multiple interview offers to an application atomically.
 * Also handles un-rejecting systems and updating status.
 * Uses a single Firestore transaction to prevent race conditions.
 */
export async function addMultipleInterviewOffers(
  applicationId: string,
  systems: string[],
  reviewDecision?: 'pending' | 'advanced' | 'rejected'
): Promise<Application | null> {
  if (systems.length === 0) {
    return getApplication(applicationId);
  }

  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const existingOffers = normalizeInterviewOffers(data.interviewOffers) || [];
    const existingOfferSystems = new Set(existingOffers.map((o) => o.system));
    // Once the applicant has chosen their interview system, the other offers
    // were cancelled by that choice; only the chosen one may be offered again
    // (the routes refuse the rest with a message). Everything below — new
    // offers, refresh, ranking join, un-reject — works on `offerable` only,
    // so a bypass cannot rank or un-reject a system it did not offer.
    const chosen = data.selectedInterviewSystem as string | undefined;
    const offerable = chosen ? systems.filter((s) => s === chosen) : systems;
    
    // Create new offers only for systems that don't already have one
    const newOffers: InterviewOffer[] = [];
    for (const system of offerable) {
      if (!existingOfferSystems.has(system)) {
        newOffers.push({
          system,
          status: InterviewEventStatus.PENDING,
          createdAt: new Date(),
        });
      }
    }

    // A system re-offering after cancelling gets a fresh pending offer. A
    // cancelled entry used to block the re-offer silently — the lead saw a
    // 200, nothing changed, and the application sat at `interview` with no
    // live offer (#127). Pending, completed and no-show offers are kept.
    // A cancelled or no-show offer that is offered again becomes a fresh
    // pending one; a completed offer is left alone.
    const REOFFERABLE = new Set<InterviewEventStatus>([InterviewEventStatus.CANCELLED, InterviewEventStatus.NO_SHOW]);
    const refreshedOffers: InterviewOffer[] = existingOffers.map((o) =>
      offerable.includes(o.system) && REOFFERABLE.has(o.status)
        ? { system: o.system, status: InterviewEventStatus.PENDING, createdAt: new Date() }
        : o
    );
    const updatedOffers = [...refreshedOffers, ...newOffers];

    // Un-reject systems that are getting offers
    const currentRejections = (data.rejectedBySystems || []) as string[];
    const updatedRejections = currentRejections.filter(
      (sys) => !offerable.includes(sys)
    );

    // Prepare update data
    const updateData: Record<string, unknown> = {
      interviewOffers: updatedOffers.map(prepareOfferForFirestore),
      rejectedBySystems: updatedRejections,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Offers for systems the applicant didn't rank are allowed (staff may pull
    // someone into a better-fit system), but everything that scopes who can
    // see an application keys off preferredSystems — so the offered system
    // joins the ranking, with the applicant's own order kept in
    // originalPreferredSystems (#104).
    Object.assign(updateData, joinRanking(data, offerable));

    // Update status to INTERVIEW if not already
    if (data.status !== ApplicationStatus.INTERVIEW) {
      updateData.status = ApplicationStatus.INTERVIEW;
    }
    
    // Set review decision if provided
    if (reviewDecision) {
      updateData.reviewDecision = reviewDecision;
    }
    
    // Clear any previous interview rejection since we're adding new offers
    // This allows the user to see the interview UI again
    updateData.interviewDecision = null;

    transaction.update(applicationRef, updateData);

    // Return the updated application data
    return {
      ...data,
      id: doc.id,
      interviewOffers: updatedOffers,
      rejectedBySystems: updatedRejections,
      preferredSystems: (updateData.preferredSystems as Application["preferredSystems"]) ?? data.preferredSystems,
      status: updateData.status || data.status,
      reviewDecision: (updateData.reviewDecision as Application["reviewDecision"]) ?? data.reviewDecision,
      interviewDecision: null as unknown as Application["interviewDecision"],
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });
}

/**
 * Add a trial offer to an application atomically.
 * Only ONE trial offer is allowed per application.
 * Also handles un-rejecting systems and updating status to TRIAL.
 * Uses a single Firestore transaction to prevent race conditions.
 */
export async function addMultipleTrialOffers(
  applicationId: string,
  systems: string[],
  interviewDecision?: 'pending' | 'advanced' | 'rejected'
): Promise<Application | null> {
  if (systems.length === 0) {
    return getApplication(applicationId);
  }

  // Enforce single system selection
  if (systems.length > 1) {
    throw new Error("Only one trial workday invite can be extended per application");
  }

  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const existingOffers = normalizeTrialOffers(data.trialOffers) || [];
    
    // Replace any existing trial offer with the new one
    // (Only one trial offer is allowed per application)
    
    // Create the single trial offer
    const newOffer: TrialOffer = {
      system: systems[0],
      status: InterviewEventStatus.PENDING,
      createdAt: new Date(),
    };

    const updatedOffers = [newOffer];

    // Un-reject systems that are getting offers
    const currentRejections = (data.rejectedBySystems || []) as string[];
    const updatedRejections = currentRejections.filter(
      (sys) => !systems.includes(sys)
    );

    // Prepare update data
    const updateData: Record<string, unknown> = {
      trialOffers: updatedOffers.map((offer) => ({
        system: offer.system,
        status: offer.status,
        createdAt: offer.createdAt,
      })),
      rejectedBySystems: updatedRejections,
      updatedAt: FieldValue.serverTimestamp(),
      // A fresh trial offer supersedes any earlier final decision, the way an
      // interview offer clears interviewDecision (#109).
      trialDecision: FieldValue.delete(),
      trialDecisionDay: FieldValue.delete(),
    };
    // Re-advancing a rejected applicant: the review stage was passed too, or
    // getUserVisibleStatus keeps their dashboard on "Rejected" and hides the offer.
    if (data.reviewDecision === "rejected") updateData.reviewDecision = "advanced";
    Object.assign(updateData, joinRanking(data, systems)); // see addMultipleInterviewOffers (#104)

    // Update status to TRIAL if not already
    if (data.status !== ApplicationStatus.TRIAL) {
      updateData.status = ApplicationStatus.TRIAL;
    }
    
    // Set interview decision if provided
    if (interviewDecision) {
      updateData.interviewDecision = interviewDecision;
    }

    transaction.update(applicationRef, updateData);

    // Return the updated application data
    return {
      ...data,
      id: doc.id,
      trialOffers: updatedOffers,
      rejectedBySystems: updatedRejections,
      preferredSystems: (updateData.preferredSystems as Application["preferredSystems"]) ?? data.preferredSystems,
      status: updateData.status || data.status,
      reviewDecision: (updateData.reviewDecision as Application["reviewDecision"]) ?? data.reviewDecision,
      interviewDecision: (updateData.interviewDecision as Application["interviewDecision"]) ?? data.interviewDecision,
      trialDecision: undefined,
      trialDecisionDay: undefined,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });
}

/**
 * Select the single interview system the applicant will interview with.
 * Every team picks one (Solar included since 2026-08-30, PR #140).
 */
export async function selectInterviewSystem(
  applicationId: string,
  system: string
): Promise<Application | null> {
  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  // Transactional, like every other writer of interviewOffers in this file:
  // it rewrites the whole array, so a concurrent staff status change through
  // updateInterviewOfferStatus would otherwise be silently lost.
  const found = await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);
    if (!doc.exists) return false;

    const application = doc.data() as Application;
    const offers = normalizeInterviewOffers(application.interviewOffers) || [];

    // The choice is one-way — re-selecting would cancel the offer the applicant
    // is actually holding. The route rejects this first with a 400; the check
    // is repeated here because the route's read and this write are not atomic.
    if (application.selectedInterviewSystem) {
      throw new Error("An interview system has already been selected for this application");
    }

    // Only a live offer can be chosen. This used to ask merely whether an offer
    // for the system existed, so an applicant could pick one they had already
    // declined and end up with every offer cancelled and no interview.
    const chosen = offers.find((o) => o.system === system);
    if (!chosen) {
      throw new Error(`No interview offer found for system: ${system}`);
    }
    if (chosen.status !== InterviewEventStatus.PENDING) {
      throw new Error(`The interview offer for ${system} is no longer open`);
    }

    // Decline every other still-pending offer — the applicant is committing to
    // `system`, and booking happens externally, so this is the only moment the
    // app can record that choice (this used to happen on successful calendar
    // booking; there is no booking step anymore).
    const updatedOffers = offers.map((offer) =>
      offer.system === system || offer.status !== InterviewEventStatus.PENDING
        ? offer
        : {
            ...offer,
            status: InterviewEventStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: "Applicant selected a different system for interview",
          }
    );

    // Narrow preferredSystems to the chosen system. Reviewer/system-lead visibility
    // (checkTeamAccess, requireStaffForApplication, and the system-scoped Firestore
    // queries in this file) all key off preferredSystems array-contains, so this is
    // what actually hides the applicant from the systems they didn't pick.
    //
    // Stash the full ranked list first. Records/CSV and future cross-system
    // logic need the original ranking even after preferredSystems collapses.
    transaction.update(applicationRef, {
      selectedInterviewSystem: system,
      originalPreferredSystems:
        application.originalPreferredSystems ?? application.preferredSystems ?? [],
      preferredSystems: [system as ElectricSystem | SolarSystem | CombustionSystem],
      interviewOffers: updatedOffers.map(prepareOfferForFirestore),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  return found ? getApplication(applicationId) : null;
}

/**
 * Update the status of a specific interview offer.
 * Used when scheduling, cancelling, or marking interviews as complete.
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function updateInterviewOfferStatus(
  applicationId: string,
  system: string,
  statusUpdate: {
    status: InterviewEventStatus;
    cancelReason?: string;
  }
): Promise<Application | null> {
  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const offers = normalizeInterviewOffers(data.interviewOffers) || [];
    const offerIndex = offers.findIndex((o) => o.system === system);

    if (offerIndex === -1) {
      throw new Error(`No interview offer found for system: ${system}`);
    }

    const updatedOffer: InterviewOffer = {
      ...offers[offerIndex],
      status: statusUpdate.status,
    };

    if (statusUpdate.status === InterviewEventStatus.CANCELLED) {
      updatedOffer.cancelledAt = new Date();
      updatedOffer.cancelReason = statusUpdate.cancelReason;
    }

    const updatedOffers = [...offers];
    updatedOffers[offerIndex] = updatedOffer;

    transaction.update(applicationRef, {
      interviewOffers: updatedOffers.map(prepareOfferForFirestore),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Return the updated application data
    return {
      ...data,
      id: doc.id,
      interviewOffers: updatedOffers,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;
  });
}

/**
 * Reject an applicant from specific systems atomically.
 * - BEFORE RELEASE_INTERVIEWS step: Removes interview offers from rejected systems
 * - AT/AFTER RELEASE_INTERVIEWS step: Preserves offers for history, marks as rejected
 * Sets status to REJECTED only if all systems with offers have rejected.
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function rejectApplicationFromSystems(
  applicationId: string,
  systems: string[],
  /** Trial-stage only: which decision day the rejection is released on (#58). Defaults to the step-based inference. */
  opts: { releaseDay?: 1 | 2 | 3 } = {}
): Promise<{ application: Application | null; fullyRejected: boolean }> {
  if (systems.length === 0) {
    const app = await getApplication(applicationId);
    return { application: app, fullyRejected: false };
  }

  // Import config dynamically to avoid circular dependencies
  const { getRecruitingConfig } = await import("@/lib/firebase/config");
  const { RecruitingStep } = await import("@/lib/models/Config");
  
  // Get current recruiting step to determine if we should remove offers
  const config = await getRecruitingConfig();
  const currentStep = config.currentStep;
  
  // Steps where we should remove offers when rejecting
  // At RELEASE_INTERVIEWS and later stages, preserve interview offers for history
  const stepsWhereInterviewOffersCanBeRemoved = [
    RecruitingStep.PRE_OPEN,
    RecruitingStep.OPEN,
    RecruitingStep.REVIEWING,
  ];
  const isBeforeInterviewStage = stepsWhereInterviewOffersCanBeRemoved.includes(currentStep);
  
  // Steps where trial offers should be preserved (trial stage and later)
  // Before trial stage, remove trial offers when rejecting (allows undoing accidental advancements)
  const stepsWhereTrialOffersPreserved = [
    RecruitingStep.RELEASE_TRIAL,
    RecruitingStep.TRIAL_WORKDAY,
    RecruitingStep.RELEASE_DECISIONS_DAY1,
    RecruitingStep.RELEASE_DECISIONS_DAY2,
    RecruitingStep.RELEASE_DECISIONS_DAY3,
  ];
  const isTrialStageOrLater = stepsWhereTrialOffersPreserved.includes(currentStep);

  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);

    if (!doc.exists) {
      return { application: null, fullyRejected: false };
    }

    const data = doc.data()!;
    const existingOffers = normalizeInterviewOffers(data.interviewOffers) || [];
    const existingTrialOffers = normalizeTrialOffers(data.trialOffers) || [];
    
    // Track rejected systems (add to existing list, avoid duplicates)
    const existingRejections = (data.rejectedBySystems || []) as string[];
    const newRejections = [...new Set([...existingRejections, ...systems])];

    // Remove interview offers if BEFORE interview stage
    // At/after interview stage, preserve interview offers for history
    let remainingInterviewOffers = existingOffers;
    let remainingTrialOffers = existingTrialOffers;

    if (isBeforeInterviewStage) {
      // Before interview stage - remove interview offers from rejected systems
      remainingInterviewOffers = existingOffers.filter(
        o => !systems.includes(o.system)
      );
    }
    
    // Remove trial offers if BEFORE trial stage (allows undoing accidental advancements)
    // At/after trial stage, preserve trial offers for history
    if (!isTrialStageOrLater) {
      remainingTrialOffers = existingTrialOffers.filter(
        o => !systems.includes(o.system)
      );
    }

    // Check if there are any non-rejected interview/trial offers remaining
    const nonRejectedInterviewSystems = existingOffers
      .map(o => o.system)
      .filter(sys => !newRejections.includes(sys));
    const hasActiveInterviewOffers = nonRejectedInterviewSystems.length > 0;

    const nonRejectedTrialSystems = existingTrialOffers
      .map(o => o.system)
      .filter(sys => !newRejections.includes(sys));
    const hasActiveTrialOffers = nonRejectedTrialSystems.length > 0;

    // A rejection is only final once every system the applicant ranked has
    // passed on them. This used to key off offers alone, and during review no
    // one has offers out yet — so the first system to say no rejected the
    // applicant for every other system they ranked, before those systems had
    // looked (12 applications on opening day). Systems that have not decided
    // still get their turn; an application with no ranked systems has no one
    // left to wait for.
    const rankedSystems = (data.preferredSystems || []) as string[];
    const allRankedRejected = rankedSystems.every((sys) => newRejections.includes(sys));

    const updateData: Record<string, unknown> = {
      rejectedBySystems: newRejections,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Update trial offers if we're before trial stage (removing them)
    if (!isTrialStageOrLater) {
      updateData.trialOffers = remainingTrialOffers.map((offer) => ({
        system: offer.system,
        status: offer.status,
        createdAt: offer.createdAt,
        respondedAt: offer.respondedAt,
        accepted: offer.accepted,
        rejectionReason: offer.rejectionReason,
      }));
    }

    // Update interview offers in Firestore if we're before interview stage (removing them)
    if (isBeforeInterviewStage) {
      updateData.interviewOffers = remainingInterviewOffers.map(prepareOfferForFirestore);
    }

    // Determine stage decisions based on recruiting step and remaining offers
    if (isBeforeInterviewStage) {
      // BEFORE interview stage - this is a review-stage rejection. Final only
      // when no other system has an offer out AND every ranked system has
      // rejected; otherwise just record this system's rejection.
      const anyOffersRemain = remainingInterviewOffers.length > 0 || remainingTrialOffers.length > 0;

      if (!anyOffersRemain && allRankedRejected) {
        updateData.reviewDecision = 'rejected';
        updateData.status = ApplicationStatus.REJECTED;
      }
    } else {
      // AT/AFTER interview stage - preserve offers, use different decision logic
      // Check for Trial offers FIRST, as an applicant in Trial stage will have both Trial and Interview offers
      if (existingTrialOffers.length > 0) {
        // Handle trial stage rejection
        if (!hasActiveTrialOffers) {
          // All trial offers rejected
          updateData.trialDecision = 'rejected';
          // DO NOT set interviewDecision to 'rejected' here - they passed interviews
          // and should see the Trial stage until the final decision release.
          updateData.status = ApplicationStatus.REJECTED;
          
          // Track which day the decision was made
          // Decisions made during TRIAL_WORKDAY are visible on DAY 1.
          // Decisions made during RELEASE_DECISIONS_DAY1 are visible on DAY 2.
          // Decisions made during RELEASE_DECISIONS_DAY2 are visible on DAY 3.
          let decisionDay: 1 | 2 | 3 = 1;
          if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY1) {
            decisionDay = 2;
          } else if (currentStep === RecruitingStep.RELEASE_DECISIONS_DAY2 || currentStep === RecruitingStep.RELEASE_DECISIONS_DAY3) {
            decisionDay = 3;
          }
          updateData.trialDecisionDay = opts.releaseDay ?? decisionDay;
        }
      } else if (existingOffers.length > 0) {
        // Update stage decisions based on whether any interview offers still exist
        // If we had interview offers, this is an interview-stage rejection
        // The reviewDecision should remain 'advanced' since they were already advanced to interviews
        if (hasActiveInterviewOffers) {
          // Some interview offers remain - keep reviewDecision as 'advanced'
          updateData.reviewDecision = 'advanced';
        } else {
          // All interview offers rejected - this is an interview-stage rejection
          // Keep reviewDecision as 'advanced' (they passed review), set interviewDecision as 'rejected'
          updateData.reviewDecision = 'advanced';
          updateData.interviewDecision = 'rejected';
          updateData.status = ApplicationStatus.REJECTED;
        }
      } else {
        // No offers at all - this is a review-stage rejection, same rule as
        // above: every ranked system has to have passed.
        if (allRankedRejected) {
          updateData.reviewDecision = 'rejected';
          updateData.status = ApplicationStatus.REJECTED;
        }
      }
    }

    transaction.update(applicationRef, updateData);

    // Compute updated values for return
    const newStatus = updateData.status || data.status;

    const updatedApplication = {
      ...data,
      id: doc.id,
      interviewOffers: remainingInterviewOffers,
      trialOffers: remainingTrialOffers,
      rejectedBySystems: newRejections,
      status: newStatus,
      reviewDecision: updateData.reviewDecision || data.reviewDecision,
      interviewDecision: updateData.interviewDecision || data.interviewDecision,
      trialDecision: updateData.trialDecision || data.trialDecision,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: new Date(),
      submittedAt: data.submittedAt?.toDate(),
    } as Application;

    return { application: updatedApplication, fullyRejected: newStatus === ApplicationStatus.REJECTED };
  });
}

/**
 * Auto-reject applicants who had to choose between multiple interview offers
 * and never did. Booking now happens on an external signup link the app
 * doesn't control, so "scheduled" can no longer be verified — the only
 * remaining reliable signal is whether an applicant who was forced to pick a
 * system (selectedInterviewSystem) did so. Every team picks one system now
 * (PR #140), so the signal exists for any applicant with more than one LIVE
 * (pending) offer — dead offers don't count, since a picker over one live
 * option is never shown. An applicant with a single offer never sees the
 * selection step, so `selectedInterviewSystem` is never set for them
 * regardless of how engaged they were — treating that as "never committed"
 * would wrongly reject the common case.
 *
 * Intended to run when the recruiting cycle moves into CLOSE_INTERVIEWS,
 * marking the end of the interview scheduling window.
 */
export async function autoRejectUnscheduledInterviewApplicants(): Promise<string[]> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("status", "==", ApplicationStatus.INTERVIEW)
    .get();

  const rejectedIds: string[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const offers = normalizeInterviewOffers(data.interviewOffers) || [];
    if (offers.length === 0) continue;

    // Booking happens on an external link, so offer status is the only record
    // of what happened. In order:
    //  1. An interview that took place is never swept, whatever else is on
    //     the record — a second offer added afterwards used to get the
    //     applicant rejected because they never used the picker.
    //  2. Offers that all ended explicitly (no-show, cancelled) are closed out
    //     for every team; those applicants otherwise sit at "Interview" with a
    //     live signup link through decision day 3.
    //  3. Applicants holding several offers who never picked one never booked
    //     anything (every team picks one system — PM, 2026-08-30).
    // A lone PENDING offer is ambiguous (never booked, or interviewed and not
    // yet marked) and is left alone rather than rejected on a guess.
    const statuses = offers.map((o) => o.status);
    if (statuses.includes(InterviewEventStatus.COMPLETED)) continue;
    const allEnded = statuses.every(
      (s) => s === InterviewEventStatus.NO_SHOW || s === InterviewEventStatus.CANCELLED
    );
    const pendingCount = statuses.filter((s) => s === InterviewEventStatus.PENDING).length;
    const neverPicked = pendingCount > 1 && !data.selectedInterviewSystem;
    if (!allEnded && !neverPicked) continue;

    await rejectApplicationFromSystems(doc.id, offers.map((o) => o.system));
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}

/**
 * Decision-advance sweep. Runs when the recruiting cycle advances INTO
 * RELEASE_DECISIONS_DAY2 or DAY3 ("acceptances locked, new acceptances out" —
 * PM, 2026-08-04). Two passes, both idempotent:
 *
 * 1) Expiry: offers released on an earlier day that were never accepted or
 *    declined are auto-rejected ("must accept before next round moves").
 * 2) Cross-team: once an applicant has COMMITTED to a team, their applications
 *    to other teams are auto-rejected at the next advance (Q6 — deferred, not
 *    instant). WAITLISTED applications are exempt: per Q8 they stay alive as
 *    the waitlist-promotion / reneg pathway.
 *
 * Mirrors the CLOSE_INTERVIEWS sweep pattern: fires only on the exact
 * transition, so admins must not skip decision days.
 *
 * Operational notes (review findings, PR #11):
 * - Writes are per-document and each one is a transaction that re-reads the
 *   document and re-applies the pass's predicate before writing. The query
 *   snapshots driving these loops go stale over the length of a full sweep,
 *   and an applicant committing in that window would otherwise be overwritten
 *   with a rejection — a plain update() wins over the transaction in
 *   respondToCommitment, so the guard belongs on this side.
 * - If a transient error interrupts a pass, both passes are idempotent AND
 *   re-triggerable: re-saving the same step in Admin → Settings re-runs this
 *   sweep (the route fires on the target step value, not on change), safely
 *   finishing the job.
 * - Pass 2 issues one query per committed user (N+1). Fine at this org's
 *   scale (hundreds of applicants); batch by `userId in [...]` (30 per clause)
 *   before reusing this at larger volumes.
 */
export async function sweepOnDecisionAdvance(
  newStep: RecruitingStep
): Promise<{ expired: string[]; crossTeamRejected: string[] }> {
  const dayEntered =
    newStep === RecruitingStep.RELEASE_DECISIONS_DAY2 ? 2 :
    newStep === RecruitingStep.RELEASE_DECISIONS_DAY3 ? 3 : null;

  const expired: string[] = [];
  const crossTeamRejected: string[] = [];
  if (!dayEntered) return { expired, crossTeamRejected };

  const now = new Date();

  // --- Pass 1: expire unanswered offers from earlier days ---
  const acceptedSnap = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("status", "==", ApplicationStatus.ACCEPTED)
    .get();

  // Both passes share this shape: the query snapshot is a cheap pre-filter, and
  // the same predicate runs again inside a transaction against the live
  // document before anything is written. The gap between query and write is
  // minutes on a full sweep, and respondToCommitment is racing us in it — its
  // transaction cannot stop a bare update(), so the re-check has to be here or
  // the sweep rejects an applicant who committed while it was running.
  const isExpirable = (d: FirebaseFirestore.DocumentData): boolean =>
    d.status === ApplicationStatus.ACCEPTED &&
    d.trialDecision === "advanced" &&
    // Offers released by THIS advance (or later days) still have their window.
    (d.trialDecisionDay || 1) < dayEntered &&
    !d.commitment; // responded — COMMITTED/DECLINED handle status

  for (const doc of acceptedSnap.docs) {
    if (!isExpirable(doc.data())) continue;

    const wrote = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref);
      if (!fresh.exists || !isExpirable(fresh.data()!)) return false;

      transaction.update(doc.ref, {
        status: ApplicationStatus.REJECTED,
        trialDecision: "rejected",
        autoRejected: { reason: "offer_expired", at: now },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (wrote) expired.push(doc.id);
  }

  // --- Pass 2: committed applicants' other applications ---
  const committedSnap = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("status", "==", ApplicationStatus.COMMITTED)
    .get();

  const TERMINAL = [
    ApplicationStatus.REJECTED,
    ApplicationStatus.DECLINED,
    ApplicationStatus.COMMITTED,
  ];

  const seenUsers = new Set<string>();
  for (const doc of committedSnap.docs) {
    const userId = doc.data().userId as string;
    if (!userId || seenUsers.has(userId)) continue;
    seenUsers.add(userId);

    const others = await adminDb
      .collection(APPLICATIONS_COLLECTION)
      .where("userId", "==", userId)
      .get();

    // Same read-then-write hazard as pass 1: a reneg landing mid-sweep turns
    // one of these "other" applications into the one the applicant just
    // committed to, and the stale snapshot would reject it.
    const isCrossTeamRejectable = (d: FirebaseFirestore.DocumentData): boolean =>
      !TERMINAL.includes(d.status) &&
      d.status !== ApplicationStatus.IN_PROGRESS && // a draft is never acted on (#127)
      d.status !== ApplicationStatus.WAITLISTED && // reneg pathway stays alive
      // ...and so does its second half: an acceptance stamped for the day being
      // entered (or later) is a promotion off the waitlist that this very
      // advance is about to reveal. Rejecting it here destroyed it before the
      // applicant ever saw it. If they leave it unanswered it expires on the
      // next advance through pass 1 like any other offer.
      !(d.status === ApplicationStatus.ACCEPTED && (d.trialDecisionDay || 1) >= dayEntered);

    for (const other of others.docs) {
      if (other.id === doc.id) continue;
      if (!isCrossTeamRejectable(other.data())) continue;

      const wrote = await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(other.ref);
        if (!fresh.exists || !isCrossTeamRejectable(fresh.data()!)) return false;

        transaction.update(other.ref, {
          status: ApplicationStatus.REJECTED,
          trialDecision: "rejected",
          // Visible from the day being entered — the applicant caused this by
          // accepting elsewhere, so there is nothing to mask.
          trialDecisionDay: dayEntered,
          autoRejected: { reason: "committed_elsewhere", at: now },
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (wrote) crossTeamRejected.push(other.id);
    }
  }

  return { expired, crossTeamRejected };
}

/**
 * Respond to a team acceptance (Commit or Decline)
 */
export async function respondToCommitment(
  applicationId: string,
  accepted: boolean,
  reason?: string,
  /** Per-application reasons for the offers declined by a commit, keyed by application id (#65). */
  declineReasons?: Record<string, string>
): Promise<Application | null> {
  const applicationRef = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);

  // Reneg is round-2-only, and admin-switchable: the PM flagged "maybe not
  // this", so the kill switch lives on config/recruiting (renegEnabled,
  // default true) where it can be flipped without a deploy.
  const { getRecruitingConfig } = await import("@/lib/firebase/config");
  const { isAtOrPast } = await import("@/lib/utils/statusUtils");
  const recruitingConfig = await getRecruitingConfig();
  const renegWindowOpen =
    recruitingConfig.renegEnabled !== false &&
    isAtOrPast(recruitingConfig.currentStep, RecruitingStep.RELEASE_DECISIONS_DAY2);

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(applicationRef);
    if (!doc.exists) return null;

    const data = doc.data() as Application;
    if (data.status !== ApplicationStatus.ACCEPTED) {
      throw new Error("Application must be in ACCEPTED status to commit/decline");
    }

    // Read other applications BEFORE any writes
    let otherDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
    let committedDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
    if (accepted) {
      const otherAppsSnapshot = await transaction.get(
        adminDb.collection(APPLICATIONS_COLLECTION)
          .where("userId", "==", data.userId)
          .where("status", "==", ApplicationStatus.ACCEPTED)
      );
      otherDocs = otherAppsSnapshot.docs;

      const committedSnapshot = await transaction.get(
        adminDb.collection(APPLICATIONS_COLLECTION)
          .where("userId", "==", data.userId)
          .where("status", "==", ApplicationStatus.COMMITTED)
      );
      committedDocs = committedSnapshot.docs.filter((d) => d.id !== applicationId);

      if (committedDocs.length > 0 && !renegWindowOpen) {
        throw new Error(
          "You have already committed to another team — that choice is final."
        );
      }
    }

    const commitment = {
      accepted,
      reason: reason || null,
      committedAt: new Date(),
    };

    const status = accepted ? ApplicationStatus.COMMITTED : ApplicationStatus.DECLINED;
    const renegedFromTeam = committedDocs[0]?.data().team as string | undefined;

    // NOW perform all writes
    transaction.update(applicationRef, {
      status,
      commitment,
      ...(accepted && renegedFromTeam ? { renegedFrom: renegedFromTeam } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Reneg: the previous acceptance flips to rejected (sheet: "prev offer
    // changes to rejected"). No notifications — Q5B.
    if (accepted) {
      for (const committedDoc of committedDocs) {
        transaction.update(committedDoc.ref, {
          status: ApplicationStatus.REJECTED,
          trialDecision: "rejected",
          autoRejected: { reason: "committed_elsewhere", at: new Date() },
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (accepted) {
      for (const otherDoc of otherDocs) {
        if (otherDoc.id !== applicationId) {
          transaction.update(otherDoc.ref, {
            status: ApplicationStatus.DECLINED,
            commitment: {
              accepted: false,
              reason: declineReasons?.[otherDoc.id] || "Committed to another team",
              committedAt: new Date(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    return {
      ...data,
      id: doc.id,
      status,
      commitment,
      updatedAt: new Date(),
    } as Application;
  });
}

/**
 * Get ALL applications (for Admin)
 */
export async function getAllApplications(): Promise<Application[]> {
  const snapshot = await adminDb.collection(APPLICATIONS_COLLECTION).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
      submittedAt: data.submittedAt?.toDate(),
      interviewOffers: normalizeInterviewOffers(data.interviewOffers),
    } as Application;
  });
}

/**
 * Get applications for a specific Team (for Team Captain)
 */
export async function getTeamApplications(team: Team): Promise<Application[]> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("team", "==", team)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
      submittedAt: data.submittedAt?.toDate(),
      interviewOffers: normalizeInterviewOffers(data.interviewOffers),
    } as Application;
  });
}

export async function getSystemApplications(
  team: Team,
  system: string
): Promise<Application[]> {
  const snapshot = await adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("team", "==", team)
    .where("preferredSystems", "array-contains", system)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
      submittedAt: data.submittedAt?.toDate(),
      interviewOffers: normalizeInterviewOffers(data.interviewOffers),
    } as Application;
  });
}

/**
 * Paginated result type for application queries
 */
export interface PaginatedApplicationsResult {
  applications: Application[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Helper to convert a Firestore document to an Application
 */
function docToApplication(doc: FirebaseFirestore.DocumentSnapshot): Application {
  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastEditAt: safeToDate(data.lastEditAt),
    submittedAt: data.submittedAt?.toDate(),
    interviewOffers: normalizeInterviewOffers(data.interviewOffers),
    trialOffers: normalizeTrialOffers(data.trialOffers),
  } as Application;
}

/**
 * Get ALL applications with pagination (for Admin)
 * @param limit - Maximum number of applications to return (default 50)
 * @param cursor - Document ID to start after for cursor-based pagination
 */
export async function getAllApplicationsPaginated(
  limit: number = 50,
  cursor?: string
): Promise<PaginatedApplicationsResult> {
  let query = adminDb
    .collection(APPLICATIONS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit + 1); // Fetch one extra to check if there are more

  if (cursor) {
    const cursorDoc = await adminDb.collection(APPLICATIONS_COLLECTION).doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;
  
  const hasMore = docs.length > limit;
  const resultDocs = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null;

  return {
    applications: resultDocs.map(docToApplication),
    nextCursor,
    hasMore,
  };
}

/**
 * Get applications for a specific Team with pagination (for Team Captain)
 * @param team - The team to filter by
 * @param limit - Maximum number of applications to return (default 50)
 * @param cursor - Document ID to start after for cursor-based pagination
 */
export async function getTeamApplicationsPaginated(
  team: Team,
  limit: number = 50,
  cursor?: string
): Promise<PaginatedApplicationsResult> {
  let query = adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("team", "==", team)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorDoc = await adminDb.collection(APPLICATIONS_COLLECTION).doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;
  
  const hasMore = docs.length > limit;
  const resultDocs = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null;

  return {
    applications: resultDocs.map(docToApplication),
    nextCursor,
    hasMore,
  };
}

/**
 * Get applications for a specific System with pagination (for System Lead/Reviewer)
 * Filters by preferredSystems (array-contains).
 * @param team - The team to filter by
 * @param system - The system to filter by (must be in preferredSystems)
 * @param limit - Maximum number of applications to return (default 50)
 * @param cursor - Document ID to start after for cursor-based pagination
 */
export async function getSystemApplicationsPaginated(
  team: Team,
  system: string,
  limit: number = 50,
  cursor?: string
): Promise<PaginatedApplicationsResult> {
  let query = adminDb
    .collection(APPLICATIONS_COLLECTION)
    .where("team", "==", team)
    .where("preferredSystems", "array-contains", system)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorDoc = await adminDb.collection(APPLICATIONS_COLLECTION).doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;
  
  const hasMore = docs.length > limit;
  const resultDocs = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null;

  return {
    applications: resultDocs.map(docToApplication),
    nextCursor,
    hasMore,
  };
}

/**
 * Update fragment that adds any of `systems` missing from the application's
 * ranking, preserving the applicant's own order in originalPreferredSystems.
 * Empty when every system was already ranked.
 */
function joinRanking(data: FirebaseFirestore.DocumentData, systems: string[]): Record<string, unknown> {
  const ranked = (Array.isArray(data.preferredSystems) ? data.preferredSystems : []) as string[];
  const unranked = systems.filter((s) => !ranked.includes(s));
  if (unranked.length === 0) return {};
  const fragment: Record<string, unknown> = { preferredSystems: [...ranked, ...unranked] };
  if (!Array.isArray(data.originalPreferredSystems)) fragment.originalPreferredSystems = ranked;
  return fragment;
}

/**
 * Revert an application to a fresh Submitted state. Never a draft — that is
 * the applicant's to submit (#127).
 * Clears every offer and decision so the applicant sees a clean "Submitted"
 * and staff review from scratch. Keeps the original submittedAt (stamped only
 * if this is the first submission) and restores the applicant's own system
 * ranking if an interview selection or an unranked offer had changed it (#108).
 */
export async function revertToSubmitted(applicationId: string): Promise<Application | null> {
  const ref = adminDb.collection(APPLICATIONS_COLLECTION).doc(applicationId);
  // Transactional like every other multi-field writer here: a concurrent
  // offer landing between the read and the write must not be clobbered.
  const found = await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) return false;
    const data = doc.data()!;
    // Belt and braces for the transition table: a draft is the applicant's to
    // submit. Never turn one into a submitted application from here (#127).
    if (data.status === ApplicationStatus.IN_PROGRESS) {
      throw new Error("A draft cannot be submitted on the applicant's behalf");
    }
    const updateData: Record<string, unknown> = {
    status: ApplicationStatus.SUBMITTED,
    reviewDecision: "pending",
    interviewDecision: "pending",
    trialDecision: "pending",
    trialDecisionDay: FieldValue.delete(),
    interviewOffers: [],
    trialOffers: [],
    selectedInterviewSystem: null,
    rejectedBySystems: [],
    offer: FieldValue.delete(),
    commitment: FieldValue.delete(),
    waitlistSystem: FieldValue.delete(),
    autoRejected: FieldValue.delete(),
    // A re-advanced applicant must get the stage emails again; trigger-emails
    // skips anyone whose trigger is already recorded.
    emailsSent: FieldValue.delete(),
    renegedFrom: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };
    if (Array.isArray(data.originalPreferredSystems) && data.originalPreferredSystems.length > 0) {
      updateData.preferredSystems = data.originalPreferredSystems;
    }
    if (!data.submittedAt) updateData.submittedAt = FieldValue.serverTimestamp();
    transaction.update(ref, updateData);
    return true;
  });
  if (!found) return null;
  return getApplication(applicationId);
}
