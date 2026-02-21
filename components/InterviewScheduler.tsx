"use client";

import { useState } from "react";
import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { useInterviewData, InterviewOfferWithSlots } from "@/hooks/useInterviewData";

interface InterviewSchedulerProps {
  application: Application;
  onScheduled?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  [InterviewEventStatus.PENDING]: {
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.15)",
    color: "#facc15",
    label: "Awaiting Scheduling",
  },
  [InterviewEventStatus.SCHEDULING]: {
    bg: "rgba(6,182,212,0.1)",
    border: "rgba(6,182,212,0.2)",
    color: "#22d3ee",
    label: "Scheduling...",
  },
  [InterviewEventStatus.SCHEDULED]: {
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.2)",
    color: "#4ade80",
    label: "Scheduled",
  },
  [InterviewEventStatus.CANCELLED]: {
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.15)",
    color: "#f87171",
    label: "Cancelled",
  },
  [InterviewEventStatus.COMPLETED]: {
    bg: "rgba(4,95,133,0.12)",
    border: "rgba(4,95,133,0.25)",
    color: "#38bdf8",
    label: "Completed",
  },
  [InterviewEventStatus.NO_SHOW]: {
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.4)",
    label: "No Show",
  },
};

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
    const style = STATUS_STYLES[status] || STATUS_STYLES[InterviewEventStatus.PENDING];

    return (
      <span
        className="px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-md"
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          color: style.color,
        }}
      >
        {style.label}
      </span>
    );
  };

  if (loading && !interviewData) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6 p-7"
        style={{ backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}
      >
        <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>{displayError}</p>
        <button
          onClick={() => {
            setActionError(null);
            mutate();
          }}
          className="mt-3 text-[13px] font-medium transition-colors duration-200"
          style={{ color: 'var(--lhr-blue-light)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!interviewData || interviewData.offers.length === 0) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="p-7">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
            >
              <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Interview Stage</h3>
          </div>
          <p className="font-urbanist text-[14px] text-white/40 leading-relaxed">
            Congratulations! Your application is being reviewed for interviews.
            Check back soon for available interview slots.
          </p>
        </div>
      </div>
    );
  }

  // System selection UI for Combustion/Electric
  if (interviewData.needsSystemSelection) {
    return (
      <div
        className="rounded-xl overflow-hidden mb-6"
        style={{ backgroundColor: 'rgba(6,182,212,0.03)', border: '1px solid rgba(6,182,212,0.12)' }}
      >
        <div className="p-7">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
            >
              <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Select Your Interview System</h3>
          </div>
          <p className="font-urbanist text-[14px] text-white/40 mb-6 leading-relaxed">
            Multiple systems are interested in interviewing you! For{" "}
            {application.team}, you can choose <strong className="text-white/60">one system</strong> to
            interview with.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {interviewData.offers.map((offer) => (
              <button
                key={offer.system}
                onClick={() => selectSystem(offer.system)}
                disabled={loading}
                className="group p-4 rounded-lg text-left transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(6,182,212,0.3)';
                  e.currentTarget.style.backgroundColor = 'rgba(6,182,212,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                }}
              >
                <h4 className="text-[14px] font-semibold text-white mb-1">
                  {offer.system}
                </h4>
                <p className="font-urbanist text-[12px] text-white/30">
                  Click to select this system
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden mb-6"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="px-7 pt-6 pb-2 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(6,182,212,0.1)' }}
        >
          <svg className="w-4 h-4" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">
          Schedule Your Interview{application.team === Team.SOLAR ? "s" : ""}
        </h3>
      </div>

      <div className="px-7 pb-7 space-y-4 mt-4">
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
              className="rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[14px] font-semibold text-white">{offer.system}</h4>
                  {getStatusBadge(offer.status)}
                </div>

                {/* Scheduled interview */}
                {isScheduled && offer.scheduledAt && (
                  <div className="space-y-3">
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(34,197,94,0.06)',
                        border: '1px solid rgba(34,197,94,0.12)',
                      }}
                    >
                      <p className="text-[13px] font-semibold" style={{ color: '#4ade80' }}>
                        Interview Scheduled
                      </p>
                      <p className="text-[14px] text-white mt-1.5 font-medium">
                        {formatDateTime(offer.scheduledAt)}
                        {offer.scheduledEndAt &&
                          ` \u2013 ${formatTime(offer.scheduledEndAt)}`}
                      </p>
                      <p className="font-urbanist text-[12px] text-white/30 mt-2">
                        A calendar invite has been sent to your email.
                      </p>
                    </div>
                    <button
                      onClick={() => cancelInterview(offer.system)}
                      disabled={cancelling}
                      className="text-[13px] font-medium transition-colors duration-200"
                      style={{ color: '#f87171' }}
                    >
                      {cancelling ? "Cancelling..." : "Cancel Interview"}
                    </button>
                  </div>
                )}

                {/* Cancelled interview */}
                {isCancelled && !showReschedule && (
                  <div className="space-y-3">
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(239,68,68,0.06)',
                        border: '1px solid rgba(239,68,68,0.12)',
                      }}
                    >
                      <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>
                        This interview was cancelled.
                        {offer.cancelReason && ` Reason: ${offer.cancelReason}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowReschedule(offer.system)}
                      className="flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-200"
                      style={{ color: 'var(--lhr-blue-light)' }}
                    >
                      Reschedule Interview
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Slot picker */}
                {(offer.status === InterviewEventStatus.PENDING ||
                  (isCancelled && showReschedule === offer.system)) && (
                  <>
                    {offer.configMissing ? (
                      <p className="font-urbanist text-[14px] text-white/40">
                        Interview configuration is being set up. Please check back later.
                      </p>
                    ) : offer.error ? (
                      <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>{offer.error}</p>
                    ) : Object.keys(slotsByDay).length === 0 ? (
                      <p className="font-urbanist text-[14px] text-white/40">
                        No available slots at this time. Please check back later.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {/* Scrollable slot picker */}
                        <div className="max-h-80 overflow-y-auto pr-2 space-y-5">
                          {Object.entries(slotsByDay).map(([day, slots]) => (
                            <div key={day}>
                              <h5 className="text-[12px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--lhr-gray-blue)' }}>
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
                                      className="px-3 py-2.5 text-[12px] font-medium rounded-lg transition-all duration-150"
                                      style={{
                                        backgroundColor: isSelected ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${isSelected ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                        color: isSelected ? '#22d3ee' : 'rgba(255,255,255,0.6)',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.borderColor = 'rgba(6,182,212,0.25)';
                                          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (!isSelected) {
                                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                        }
                                      }}
                                    >
                                      {formatTime(slot.start)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Confirmation bar */}
                        {selectedSlot?.system === offer.system && (
                          <div
                            className="flex items-center justify-between gap-4 p-4 rounded-lg"
                            style={{
                              backgroundColor: 'rgba(6,182,212,0.04)',
                              border: '1px solid rgba(6,182,212,0.12)',
                            }}
                          >
                            <p className="text-[13px] text-white/50 flex-shrink-0">
                              Selected:{" "}
                              <span className="text-white font-medium">
                                {formatDateTime(selectedSlot.start)}
                              </span>
                            </p>
                            <button
                              onClick={scheduleInterview}
                              disabled={scheduling}
                              className="flex-shrink-0 h-9 px-5 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                              style={{
                                backgroundColor: 'var(--lhr-blue)',
                                color: '#fff',
                              }}
                            >
                              {scheduling ? "Scheduling..." : "Confirm"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
