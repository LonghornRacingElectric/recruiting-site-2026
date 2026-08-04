import useSWR from "swr";
import { InterviewEventStatus } from "@/lib/models/Application";

interface InterviewOfferWithSlots {
  system: string;
  status: InterviewEventStatus;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  signupLink?: string;
  configMissing?: boolean;
  error?: string;
}

interface InterviewDataResponse {
  team: string;
  offers: InterviewOfferWithSlots[];
  selectedSystem?: string;
  needsSystemSelection: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (res.status === 401) {
    // Session mismatch - log out the user
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    }
    window.location.href = "/auth/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to load interview data");
  }
  return res.json();
};

/**
 * Hook to fetch interview scheduling data for an application.
 * Data is cached and revalidated on focus/reconnect.
 */
export function useInterviewData(applicationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<InterviewDataResponse>(
    applicationId ? `/api/applications/${applicationId}/interview` : null,
    fetcher
  );

  return {
    interviewData: data ?? null,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

export type { InterviewOfferWithSlots, InterviewDataResponse };
