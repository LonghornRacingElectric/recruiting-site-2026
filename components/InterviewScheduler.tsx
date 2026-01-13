"use client";

import { useState } from "react";
import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { useInterviewData, InterviewOfferWithSlots } from "@/hooks/useInterviewData";

interface InterviewSchedulerProps {
  application: Application;
  onScheduled?: () => void;
}

export default function InterviewScheduler({
  application,
  onScheduled,
}: InterviewSchedulerProps) {
  const { interviewData, isLoading: loading, error, mutate } = useInterviewData(application.id);
  const [selectedSlot, setSelectedSlot] = useState<{
    system: string;
    start: string;
    end: string;
  } | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReschedule, setShowReschedule] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Select system for Combustion/Electric
  const selectSystem = async (system: string) => {
    setActionError(null);

    try {
      const res = await fetch(`/api/applications/${application.id}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to select system");
      }

      // Revalidate interview data
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to select system");
    }
  };

  // Schedule interview
  const scheduleInterview = async () => {
    if (!selectedSlot) return;

    setScheduling(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/applications/${application.id}/interview/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: selectedSlot.system,
            slotStart: selectedSlot.start,
            slotEnd: selectedSlot.end,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to schedule interview");
      }

      setSelectedSlot(null);
      setShowReschedule(null);
      mutate();
      onScheduled?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to schedule interview");
    } finally {
      setScheduling(false);
    }
  };

  // Cancel interview
  const cancelInterview = async (system: string) => {
    if (!confirm("Are you sure you want to cancel this interview?")) return;

    setCancelling(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/applications/${application.id}/interview/schedule`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system, reason: "Cancelled by applicant" }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel interview");
      }

      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to cancel interview");
    } finally {
      setCancelling(false);
    }
  };

  // Format date for display
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Format time only
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Group slots by day
  const groupSlotsByDay = (slots: { start: string; end: string }[]) => {
    const groups: Record<string, { start: string; end: string }[]> = {};
    slots.forEach((slot) => {
      const date = new Date(slot.start).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(slot);
    });
    return groups;
  };

  // Combined error from SWR or actions
  const displayError = actionError || (error instanceof Error ? error.message : error);

  // Status badge
  const getStatusBadge = (status: InterviewEventStatus) => {
    const styles = {
      [InterviewEventStatus.PENDING]: {
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/20",
        text: "text-yellow-400",
        label: "Awaiting Scheduling",
      },
      [InterviewEventStatus.SCHEDULING]: {
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
        text: "text-cyan-400",
        label: "Scheduling...",
      },
      [InterviewEventStatus.SCHEDULED]: {
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        text: "text-green-400",
        label: "Scheduled",
      },
      [InterviewEventStatus.CANCELLED]: {
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        text: "text-red-400",
        label: "Cancelled",
      },
      [InterviewEventStatus.COMPLETED]: {
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        text: "text-blue-400",
        label: "Completed",
      },
      [InterviewEventStatus.NO_SHOW]: {
        bg: "bg-neutral-500/10",
        border: "border-neutral-500/20",
        text: "text-neutral-400",
        label: "No Show",
      },
    };

    const style = styles[status] || styles[InterviewEventStatus.PENDING];

    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${style.bg} ${style.border} ${style.text} border`}
      >
        {style.label}
      </span>
    );
  };

  if (loading && !interviewData) {
    return (
      <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
        <div className="flex items-center justify-center py-8">
          <svg
            className="animate-spin h-8 w-8 text-cyan-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="p-6 rounded-2xl bg-neutral-900 border border-red-500/20">
        <p className="text-red-400 text-sm">{displayError}</p>
        <button
          onClick={() => {
            setActionError(null);
            mutate();
          }}
          className="mt-4 text-sm text-cyan-400 hover:text-cyan-300"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!interviewData || interviewData.offers.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
        <h3 className="text-lg font-bold text-white mb-2">
          🎉 Interview Stage
        </h3>
        <p className="text-neutral-400 text-sm">
          Congratulations! Your application is being reviewed for interviews.
          Check back soon for available interview slots.
        </p>
      </div>
    );
  }

  // System selection UI for Combustion/Electric
  if (interviewData.needsSystemSelection) {
    return (
      <div className="p-6 rounded-2xl bg-neutral-900 border border-cyan-500/20">
        <h3 className="text-lg font-bold text-white mb-2">
          🎯 Select Your Interview System
        </h3>
        <p className="text-neutral-400 text-sm mb-6">
          Multiple systems are interested in interviewing you! For{" "}
          {application.team}, you can choose <strong>one system</strong> to
          interview with.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {interviewData.offers.map((offer) => (
            <button
              key={offer.system}
              onClick={() => selectSystem(offer.system)}
              disabled={loading}
              className="p-4 rounded-lg bg-black/50 border border-white/10 hover:border-cyan-500/50 transition-all text-left group"
            >
              <h4 className="font-medium text-white group-hover:text-cyan-400 transition-colors">
                {offer.system}
              </h4>
              <p className="text-xs text-neutral-500 mt-1">
                Click to select this system
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-neutral-900 border border-cyan-500/20">
      <h3 className="text-lg font-bold text-white mb-4">
        📅 Schedule Your Interview{application.team === Team.SOLAR && "s"}
      </h3>

      <div className="space-y-6">
        {interviewData.offers.map((offer) => {
          // For Combustion/Electric, only show the selected system
          if (
            application.team !== Team.SOLAR &&
            interviewData.selectedSystem &&
            offer.system !== interviewData.selectedSystem
          ) {
            return null;
          }

          const isScheduled = offer.status === InterviewEventStatus.SCHEDULED;
          const isCancelled = offer.status === InterviewEventStatus.CANCELLED;
          const slotsByDay = groupSlotsByDay(offer.availableSlots);

          return (
            <div
              key={offer.system}
              className="p-4 rounded-lg bg-black/50 border border-white/5"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-white">{offer.system}</h4>
                {getStatusBadge(offer.status)}
              </div>

              {/* Scheduled interview */}
              {isScheduled && offer.scheduledAt && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-green-400 text-sm font-medium">
                      ✓ Interview Scheduled
                    </p>
                    <p className="text-white mt-2">
                      {formatDateTime(offer.scheduledAt)}
                      {offer.scheduledEndAt &&
                        ` - ${formatTime(offer.scheduledEndAt)}`}
                    </p>
                    <p className="text-neutral-400 text-xs mt-2">
                      A calendar invite has been sent to your email.
                    </p>
                  </div>
                  <button
                    onClick={() => cancelInterview(offer.system)}
                    disabled={cancelling}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Interview"}
                  </button>
                </div>
              )}

              {/* Cancelled interview */}
              {isCancelled && !showReschedule && (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-red-400 text-sm">
                      This interview was cancelled.
                      {offer.cancelReason && ` Reason: ${offer.cancelReason}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowReschedule(offer.system)}
                    className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Reschedule Interview →
                  </button>
                </div>
              )}

              {/* Slot picker - show for PENDING or when rescheduling a cancelled interview */}
              {(offer.status === InterviewEventStatus.PENDING || 
                (isCancelled && showReschedule === offer.system)) && (
                <>
                  {offer.configMissing ? (
                    <p className="text-neutral-400 text-sm">
                      Interview configuration is being set up. Please check back
                      later.
                    </p>
                  ) : offer.error ? (
                    <p className="text-red-400 text-sm">{offer.error}</p>
                  ) : Object.keys(slotsByDay).length === 0 ? (
                    <p className="text-neutral-400 text-sm">
                      No available slots at this time. Please check back later.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Scrollable slot picker */}
                      <div className="max-h-80 overflow-y-auto pr-2 space-y-4">
                        {Object.entries(slotsByDay).map(([day, slots]) => (
                          <div key={day}>
                            <h5 className="text-sm font-medium text-neutral-300 mb-2">
                              {day}
                            </h5>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {slots.map((slot) => {
                                const isSelected =
                                  selectedSlot?.system === offer.system &&
                                  selectedSlot?.start === slot.start;
                                return (
                                  <button
                                    key={slot.start}
                                    onClick={() =>
                                      setSelectedSlot({
                                        system: offer.system,
                                        start: slot.start,
                                        end: slot.end,
                                      })
                                    }
                                    className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                                      isSelected
                                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                                        : "bg-neutral-800 border-white/10 text-white hover:border-cyan-500/50"
                                    }`}
                                  >
                                    {formatTime(slot.start)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Sticky confirmation bar - appears outside scroll area when slot selected */}
                      {selectedSlot?.system === offer.system && (
                        <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-black/90 via-black/80 to-transparent -mx-4 px-4 -mb-4 border-t border-white/10">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-neutral-300 flex-shrink-0">
                              Selected:{" "}
                              <span className="text-white font-medium">
                                {formatDateTime(selectedSlot.start)}
                              </span>
                            </p>
                            <button
                              onClick={scheduleInterview}
                              disabled={scheduling}
                              className="flex-shrink-0 px-6 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-sm transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20"
                            >
                              {scheduling
                                ? "Scheduling..."
                                : "Confirm Interview"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
