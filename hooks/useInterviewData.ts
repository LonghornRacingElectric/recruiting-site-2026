import useSWR from "swr";
import { InterviewEventStatus } from "@/lib/models/Application";

interface AvailableSlot {
  start: string;
  end: string;
}

interface InterviewOfferWithSlots {
  system: string;
  status: InterviewEventStatus;
  eventId?: string;
  scheduledAt?: string;
  scheduledEndAt?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  availableSlots: AvailableSlot[];
  configMissing?: boolean;
  error?: string;
}

interface InterviewDataResponse {
  offers: InterviewOfferWithSlots[];
  selectedSystem?: string;
  needsSystemSelection: boolean;
}

const fetcher = (url: string) => fetch(url).then(async (res) => {
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to load interview data");
  }
  return res.json();
});

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

export type { InterviewOfferWithSlots, AvailableSlot, InterviewDataResponse };
