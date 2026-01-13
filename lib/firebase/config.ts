import { adminDb } from "./admin";
import { RecruitingConfig, RecruitingStep, Announcement } from "@/lib/models/Config";

const CONFIG_COLLECTION = "config";
const RECRUITING_DOC = "recruiting";
const ANNOUNCEMENT_DOC = "announcement";

export async function getRecruitingConfig(): Promise<RecruitingConfig> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).get();
  
  if (doc.exists) {
    const data = doc.data();
    return {
      currentStep: data?.currentStep || RecruitingStep.OPEN,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  // Default config if none exists
  return {
    currentStep: RecruitingStep.OPEN,
    updatedAt: new Date(),
    updatedBy: "system",
  };
}

export async function updateRecruitingStep(step: RecruitingStep, adminId: string): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(RECRUITING_DOC).set({
    currentStep: step,
    updatedAt: new Date(),
    updatedBy: adminId,
  }, { merge: true });
}

export async function getAnnouncement(): Promise<Announcement | null> {
  const doc = await adminDb.collection(CONFIG_COLLECTION).doc(ANNOUNCEMENT_DOC).get();
  
  if (doc.exists) {
    const data = doc.data();
    return {
      message: data?.message || "",
      enabled: data?.enabled || false,
      updatedAt: data?.updatedAt?.toDate() || new Date(),
      updatedBy: data?.updatedBy || "system",
    };
  }

  return null;
}

export async function updateAnnouncement(message: string, enabled: boolean, adminId: string): Promise<void> {
  await adminDb.collection(CONFIG_COLLECTION).doc(ANNOUNCEMENT_DOC).set({
    message,
    enabled,
    updatedAt: new Date(),
    updatedBy: adminId,
  });
}

