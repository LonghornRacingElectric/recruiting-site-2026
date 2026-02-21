"use client";

import { useEffect, useState, Suspense } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApplicationStatus } from "@/lib/models/Application";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";
import { useApplications } from "@/hooks/useApplications";

import { RecruitingStep } from "@/lib/models/Config";

const TEAM_COLORS: Record<string, string> = {
  Electric: "#FFB526",
  Solar: "#FF9404",
  Combustion: "#FFC871",
};

function getStatusStyle(status: ApplicationStatus) {
  const styles: Record<string, { bg: string; border: string; text: string; label: string }> = {
    [ApplicationStatus.IN_PROGRESS]: {
      bg: "rgba(234,179,8,0.08)",
      border: "rgba(234,179,8,0.15)",
      text: "#facc15",
      label: "In Progress",
    },
    [ApplicationStatus.SUBMITTED]: {
      bg: "rgba(4,95,133,0.12)",
      border: "rgba(4,95,133,0.25)",
      text: "#38bdf8",
      label: "Submitted",
    },
    [ApplicationStatus.INTERVIEW]: {
      bg: "rgba(6,182,212,0.1)",
      border: "rgba(6,182,212,0.2)",
      text: "#22d3ee",
      label: "Interview",
    },
    [ApplicationStatus.ACCEPTED]: {
      bg: "rgba(34,197,94,0.1)",
      border: "rgba(34,197,94,0.2)",
      text: "#4ade80",
      label: "Accepted",
    },
    [ApplicationStatus.REJECTED]: {
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.15)",
      text: "#f87171",
      label: "Not Selected",
    },
    [ApplicationStatus.TRIAL]: {
      bg: "rgba(168,85,247,0.1)",
      border: "rgba(168,85,247,0.2)",
      text: "#c084fc",
      label: "Trial Workday",
    },
    [ApplicationStatus.WAITLISTED]: {
      bg: "rgba(245,158,11,0.1)",
      border: "rgba(245,158,11,0.2)",
      text: "#fbbf24",
      label: "Waitlisted",
    },
  };
  return styles[status] || styles[ApplicationStatus.IN_PROGRESS];
}

// Trial Offer Response Component
function TrialOfferResponse({
  applicationId,
  system,
  onResponse
}: {
  applicationId: string;
  system: string;
  onResponse: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/trial/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      if (res.ok) {
        toast.success("Trial workday accepted!");
        onResponse();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to accept");
      }
    } catch (e) {
      toast.error("Failed to accept trial workday");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for declining");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/trial/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: false, rejectionReason }),
      });
      if (res.ok) {
        toast.success("Response recorded");
        setShowRejectModal(false);
        onResponse();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to submit response");
      }
    } catch (e) {
      toast.error("Failed to submit response");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex-1 h-10 px-4 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          {loading ? "..." : "Accept"}
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={loading}
          className="flex-1 h-10 px-4 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Decline
        </button>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="rounded-xl p-7 max-w-md w-full mx-4"
            style={{ backgroundColor: '#0c1218', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <h3 className="text-lg font-bold text-white mb-2">Decline Trial Workday</h3>
            <p className="font-urbanist text-[14px] text-white/40 mb-5">
              Please let us know why you&apos;re declining the {system} trial workday.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Schedule conflict, accepted another offer, etc."
              className="w-full h-24 p-3 rounded-lg text-[14px] text-white placeholder-white/20 focus:outline-none focus:ring-1 mb-5 font-urbanist"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', outlineColor: 'var(--lhr-blue)' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={loading}
                className="flex-1 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 disabled:opacity-40"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get("submitted") === "true";

  const { applications, recruitingStep, announcement, isLoading: loading, mutate } = useApplications();
  const [showSuccessMessage, setShowSuccessMessage] = useState(justSubmitted);

  // Force SWR to revalidate when returning from a successful submission
  useEffect(() => {
    if (justSubmitted) {
      mutate();
    }
  }, [justSubmitted, mutate]);

  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  // Get teams that don't have an application yet
  const appliedTeams = new Set(applications.map((app) => app.team));
  const availableTeams = TEAM_INFO.filter(
    (team) => !appliedTeams.has(team.team)
  );

  const isApplicationsOpen = recruitingStep === RecruitingStep.OPEN;

  // Handle errors / showing closed status
  const handleApplyClick = (e: React.MouseEvent) => {
    if (!isApplicationsOpen) {
      e.preventDefault();
      toast.error("Applications are currently closed.");
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse at 20% 0%, rgba(4,95,133,0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(255,181,38,0.04) 0%, transparent 40%), #030608',
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-6xl">
        {/* Success Message */}
        {showSuccessMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-lg text-[13px] font-medium flex items-center gap-3 animate-fade-slide-up"
            style={{
              backgroundColor: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.15)',
              color: '#4ade80',
            }}
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Your application has been submitted successfully!
          </div>
        )}

        {/* Closed Banner */}
        {!isApplicationsOpen && (
          <div
            className="mb-6 px-5 py-4 rounded-lg text-[13px] font-medium flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.12)',
              color: '#f87171',
            }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span><strong>Applications are currently closed.</strong> You can check your status below, but new applications cannot be submitted.</span>
          </div>
        )}

        {/* Page header */}
        <div className="mb-10">
          <p
            className="text-xs font-semibold tracking-[0.3em] uppercase mb-3"
            style={{ color: 'var(--lhr-gray-blue)' }}
          >
            Applicant Portal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Your Dashboard
          </h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Applications Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Your Applications Card */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="px-7 pt-6 pb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Your Applications</h2>
                {availableTeams.length > 0 && isApplicationsOpen && (
                  <Link
                    href={routes.apply}
                    className="flex items-center gap-1.5 text-[13px] font-medium tracking-wide transition-colors duration-200"
                    style={{ color: 'var(--lhr-gold)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    New Application
                  </Link>
                )}
              </div>

              <div className="px-7 pb-7">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : applications.length === 0 ? (
                  <div className="text-center py-14">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"
                      style={{ backgroundColor: 'rgba(4,95,133,0.1)' }}
                    >
                      <svg className="w-5 h-5" style={{ color: 'var(--lhr-blue-light)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h3 className="text-[15px] font-semibold text-white mb-1.5">No applications yet</h3>
                    <p className="font-urbanist text-[14px] text-white/35 mb-6 max-w-xs mx-auto">
                      {isApplicationsOpen
                        ? "Start your journey by applying to one of our teams."
                        : "Applications are closed for this cycle."}
                    </p>
                    {isApplicationsOpen && (
                      <Link
                        href={routes.apply}
                        className="inline-flex h-10 items-center justify-center rounded-lg px-6 text-[13px] font-semibold tracking-wide transition-all duration-200"
                        style={{ backgroundColor: 'var(--lhr-gold)', color: '#000' }}
                      >
                        Apply Now
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {applications.map((app) => {
                      const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
                      const isInProgress = app.status === ApplicationStatus.IN_PROGRESS;
                      const statusStyle = getStatusStyle(app.status);
                      const teamColor = TEAM_COLORS[teamInfo?.name || "Electric"];

                      const linkHref = isInProgress && isApplicationsOpen
                        ? routes.applyTeam(app.team)
                        : `/dashboard/applications/${app.id}`;

                      return (
                        <Link
                          key={app.id}
                          href={linkHref}
                          className="group flex items-center justify-between p-4 rounded-lg transition-all duration-200"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                          }}
                        >
                          <div className="flex items-center gap-4">
                            {/* Team color indicator */}
                            <div
                              className="w-1 h-10 rounded-full shrink-0"
                              style={{ backgroundColor: teamColor }}
                            />
                            <div>
                              <h3 className="text-[14px] font-semibold text-white">
                                {teamInfo?.name} Application
                              </h3>
                              {app.preferredSystems?.length ? (
                                <p className="font-urbanist text-[12px] text-white/30 mt-0.5">
                                  {app.preferredSystems.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Status badge */}
                            <span
                              className="px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-md"
                              style={{
                                backgroundColor: statusStyle.bg,
                                border: `1px solid ${statusStyle.border}`,
                                color: statusStyle.text,
                              }}
                            >
                              {!isApplicationsOpen && isInProgress ? "Not Submitted" : statusStyle.label}
                            </span>
                            <svg
                              className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors duration-200"
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Trial Workday Section */}
            {(recruitingStep === RecruitingStep.RELEASE_TRIAL ||
              recruitingStep === RecruitingStep.TRIAL_WORKDAY ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY1 ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY2 ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY3) &&
              applications.some((app) =>
                app.status === ApplicationStatus.TRIAL &&
                app.trialOffers && app.trialOffers.length > 0
              ) && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}
                >
                  <div className="px-7 pt-6 pb-2">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      Trial Workday Invite
                    </h2>
                  </div>
                  <div className="px-7 pb-7">
                    {applications
                      .filter((app) =>
                        app.status === ApplicationStatus.TRIAL &&
                        app.trialOffers && app.trialOffers.length > 0
                      )
                      .map((app) => {
                        const trialOffer = app.trialOffers![0];
                        const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
                        const hasResponded = trialOffer.accepted !== undefined;
                        const teamColor = TEAM_COLORS[teamInfo?.name || "Electric"];

                        return (
                          <div
                            key={app.id}
                            className="p-4 rounded-lg"
                            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-1 h-8 rounded-full shrink-0"
                                style={{ backgroundColor: teamColor }}
                              />
                              <div>
                                <h3 className="text-[14px] font-semibold text-white">
                                  {teamInfo?.name} &mdash; {trialOffer.system}
                                </h3>
                                <p className="font-urbanist text-[12px] text-white/30 mt-0.5">
                                  Trial Workday Invitation
                                </p>
                              </div>
                            </div>

                            {hasResponded ? (
                              <div
                                className="mt-4 p-3 rounded-lg text-[13px] font-medium"
                                style={{
                                  backgroundColor: trialOffer.accepted ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                                  border: `1px solid ${trialOffer.accepted ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                  color: trialOffer.accepted ? '#4ade80' : '#f87171',
                                }}
                              >
                                {trialOffer.accepted ? 'You accepted this trial workday' : 'You declined this trial workday'}
                                {trialOffer.rejectionReason && (
                                  <p className="text-[12px] text-white/30 mt-1 font-normal">
                                    Reason: {trialOffer.rejectionReason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <TrialOfferResponse
                                applicationId={app.id}
                                system={trialOffer.system}
                                onResponse={() => { mutate(); }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

            {/* Quick Apply Section */}
            {availableTeams.length > 0 && applications.length > 0 && isApplicationsOpen && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="px-7 pt-6 pb-2">
                  <h2 className="text-lg font-semibold text-white">Apply to More Teams</h2>
                </div>
                <div className="px-7 pb-7">
                  <div className="grid sm:grid-cols-3 gap-3">
                    {availableTeams.map((teamInfo) => (
                      <Link
                        key={teamInfo.team}
                        href={routes.applyTeam(teamInfo.team)}
                        className="group p-5 rounded-lg text-center transition-all duration-200"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.04)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = `${teamInfo.color}30`;
                          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
                        }}
                      >
                        <span className="text-2xl block mb-2">{teamInfo.icon}</span>
                        <span
                          className="text-[13px] font-semibold tracking-wide"
                          style={{ color: teamInfo.color }}
                        >
                          {teamInfo.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Announcements Card */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="px-7 pt-6 pb-2">
                <h2 className="text-lg font-semibold text-white">Announcements</h2>
              </div>
              <div className="px-7 pb-7 space-y-3">
                {/* Custom Admin Announcement */}
                {announcement && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255,148,4,0.06)',
                      border: '1px solid rgba(255,148,4,0.12)',
                    }}
                  >
                    <span className="text-[11px] font-semibold tracking-widest uppercase block mb-1.5" style={{ color: 'var(--lhr-orange)' }}>
                      Important
                    </span>
                    <p className="font-urbanist text-[14px] text-white/70 whitespace-pre-wrap break-words leading-relaxed">
                      {announcement.message}
                    </p>
                  </div>
                )}

                <div
                  className="p-4 rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="text-[11px] font-semibold tracking-widest uppercase block mb-1.5"
                    style={{ color: isApplicationsOpen ? 'var(--lhr-gold)' : 'var(--lhr-gray-blue)' }}
                  >
                    {isApplicationsOpen ? "Open" : "Notice"}
                  </span>
                  <h3 className="text-[14px] font-semibold text-white mb-1">
                    {isApplicationsOpen ? "Applications Open" : "Applications Closed"}
                  </h3>
                  <p className="font-urbanist text-[12px] text-white/30 leading-relaxed">
                    {isApplicationsOpen
                      ? "We're now accepting applications for the upcoming semester!"
                      : "Applications are no longer being accepted at this time."}
                  </p>
                </div>

                <div
                  className="p-4 rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <h3 className="text-[14px] font-semibold text-white mb-1">Info Sessions</h3>
                  <p className="font-urbanist text-[12px] text-white/30 leading-relaxed">
                    Learn more about each team at our weekly info sessions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: '#030608' }}>
          <svg className="animate-spin h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
