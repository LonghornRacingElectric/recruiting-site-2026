"use client";

import posthog from "posthog-js";
import { Application, InterviewEventStatus } from "@/lib/models/Application";
import { Team } from "@/lib/models/User";
import { useInterviewData } from "@/hooks/useInterviewData";
import { toast } from "react-hot-toast";

interface InterviewSchedulerProps {
  application: Application;
  onScheduled?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  [InterviewEventStatus.PENDING]: {
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.15)",
    color: "#facc15",
    label: "Awaiting Signup",
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
}: InterviewSchedulerProps) {
  const { interviewData, isLoading: loading, error, mutate } = useInterviewData(application.id);

  // Select system for Combustion/Electric
  const selectSystem = async (system: string) => {
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

      posthog.capture("interview_system_selected", {
        team: application.team,
        system,
      });
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to select system");
    }
  };

  const copyLink = async (link: string, system: string) => {
    try {
      await navigator.clipboard.writeText(link);
      posthog.capture("interview_signup_link_copied", {
        team: application.team,
        system,
      });
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const trackSignupLinkOpened = (system: string) => {
    posthog.capture("interview_signup_link_opened", {
      team: application.team,
      system,
    });
  };

  const displayError = error instanceof Error ? error.message : error;

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
          onClick={() => mutate()}
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

                {offer.status === InterviewEventStatus.PENDING && offer.signupLink && (
                  <div className="space-y-3">
                    <div
                      className="p-4 rounded-lg flex items-start gap-2.5"
                      style={{ backgroundColor: 'rgba(255,181,38,0.06)', border: '1px solid rgba(255,181,38,0.15)' }}
                    >
                      <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'rgba(255,181,38,0.8)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: 'rgba(255,181,38,0.85)' }}>
                        Do not distribute this link. It is for your use only — sharing it could let someone else book your interview slot.
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-lg"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <p className="font-urbanist text-[12px] text-white/30 mb-2">Your signup link</p>
                      <p className="text-[13px] text-white/70 break-all mb-4">{offer.signupLink}</p>
                      <div className="flex items-center gap-2">
                        <a
                          href={offer.signupLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackSignupLinkOpened(offer.system)}
                          className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
                          style={{ backgroundColor: 'var(--lhr-blue)', color: '#fff' }}
                        >
                          Open signup form
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-8.25 8.25M6 10.5v7.5A1.5 1.5 0 007.5 19.5H15" />
                          </svg>
                        </a>
                        <button
                          onClick={() => copyLink(offer.signupLink!, offer.system)}
                          className="h-9 px-4 rounded-lg text-[13px] font-medium transition-all duration-200"
                          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                        >
                          Copy link
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {offer.status === InterviewEventStatus.PENDING && offer.configMissing && (
                  <p className="font-urbanist text-[14px] text-white/40">
                    Your signup link isn&apos;t available yet. Please check back later.
                  </p>
                )}

                {offer.status === InterviewEventStatus.PENDING && offer.error && (
                  <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>{offer.error}</p>
                )}

                {offer.status === InterviewEventStatus.CANCELLED && (
                  <div
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}
                  >
                    <p className="text-[13px] font-medium" style={{ color: '#f87171' }}>
                      This interview was cancelled.
                      {offer.cancelReason && ` Reason: ${offer.cancelReason}`}
                    </p>
                  </div>
                )}

                {offer.status === InterviewEventStatus.COMPLETED && (
                  <p className="font-urbanist text-[14px] text-white/40">Your interview has been marked complete.</p>
                )}

                {offer.status === InterviewEventStatus.NO_SHOW && (
                  <p className="font-urbanist text-[14px] text-white/40">This interview was marked as a no-show.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
