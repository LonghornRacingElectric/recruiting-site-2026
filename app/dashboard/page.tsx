"use client";

import { useEffect, useState, Suspense } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApplicationStatus } from "@/lib/models/Application";
import { TEAM_INFO } from "@/lib/models/teamQuestions";
import { routes } from "@/lib/routes";
import { useApplications } from "@/hooks/useApplications";

function getStatusBadge(status: ApplicationStatus, isApplicationsOpen: boolean) {
  const styles = {
    [ApplicationStatus.IN_PROGRESS]: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
      text: "text-yellow-400",
      label: "In Progress",
    },
    [ApplicationStatus.SUBMITTED]: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      text: "text-blue-400",
      label: "Submitted",
    },
    [ApplicationStatus.INTERVIEW]: {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      text: "text-cyan-400",
      label: "Interview",
    },
    [ApplicationStatus.ACCEPTED]: {
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      text: "text-green-400",
      label: "Accepted",
    },
    [ApplicationStatus.REJECTED]: {
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      text: "text-red-400",
      label: "Rejected",
    },
    [ApplicationStatus.TRIAL]: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
      text: "text-purple-400",
      label: "Trial Workday",
    },
  };

  // Override for In Progress when closed
  if (!isApplicationsOpen && status === ApplicationStatus.IN_PROGRESS) {
    const closedStyle = {
      bg: "bg-neutral-500/10",
      border: "border-neutral-500/20",
      text: "text-neutral-400",
      label: "Not Submitted",
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${closedStyle.bg} ${closedStyle.border} ${closedStyle.text} border`}
      >
        {closedStyle.label}
      </span>
    );
  }

  const style = styles[status] || styles[ApplicationStatus.IN_PROGRESS];

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${style.bg} ${style.border} ${style.text} border`}
    >
      {style.label}
    </span>
  );
}

import { RecruitingStep } from "@/lib/models/Config";

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
      <div className="flex gap-3">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="flex-1 py-2 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Accept"}
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={loading}
          className="flex-1 py-2 px-4 rounded-lg bg-neutral-700 text-white font-medium hover:bg-neutral-600 transition-colors disabled:opacity-50"
        >
          Decline
        </button>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Decline Trial Workday</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Please let us know why you're declining the {system} trial workday.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Schedule conflict, accepted another offer, etc."
              className="w-full h-24 p-3 rounded-lg bg-black border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
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
    <main className="min-h-screen bg-black pt-24 pb-20">
      <div className="container mx-auto px-4">
        {/* Success Message */}
        {showSuccessMessage && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
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
             <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
            <strong>Applications are currently closed.</strong> You can check your status below, but new applications cannot be submitted.
          </div>
        )}

        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Member <span className="text-[#FFB526]">Dashboard</span>
          </h1>
          <p className="text-neutral-400">
            Welcome back! Keep track of your applications and interviews here.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Applications Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Your Applications Card */}
            <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Your Applications
                </h2>
                {availableTeams.length > 0 && isApplicationsOpen && (
                  <Link
                    href={routes.apply}
                    className="text-sm font-medium text-[#FFB526] hover:text-[#e6a220] transition-colors flex items-center gap-1"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    New Application
                  </Link>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <svg
                    className="animate-spin h-8 w-8 text-neutral-500"
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
              ) : applications.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📝</div>
                  <h3 className="text-lg font-medium text-white mb-2">
                    No applications yet
                  </h3>
                  <p className="text-neutral-400 text-sm mb-6">
                    {isApplicationsOpen 
                        ? "Start your journey by applying to one of our teams." 
                        : "Applications are closed for this cycle."}
                  </p>
                  {isApplicationsOpen && (
                      <Link
                        href={routes.apply}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-[#FFB526] px-6 text-sm font-medium text-black hover:bg-[#e6a220] transition-colors"
                      >
                        Apply Now
                      </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {applications.map((app) => {
                    const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
                    const isInProgress = app.status === ApplicationStatus.IN_PROGRESS;
                    
                    // In-progress apps link to apply page, submitted apps link to detail page
                    const linkHref = isInProgress && isApplicationsOpen
                      ? routes.applyTeam(app.team)
                      : `/dashboard/applications/${app.id}`;
                    
                    return (
                      <Link
                        key={app.id}
                        href={linkHref}
                        className="block p-4 rounded-lg bg-black/50 border border-white/5 hover:border-white/20 hover:bg-black/70 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{teamInfo?.icon}</span>
                            <div>
                              <h3 className="font-medium text-white">
                                {teamInfo?.name} Application
                              </h3>
                              {app.preferredSystems?.length ? (
                                <p className="text-xs text-neutral-500">
                                  Preferred: {app.preferredSystems.join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-neutral-400 group-hover:text-white transition-colors">
                              {isInProgress && isApplicationsOpen ? "Continue →" : "View Application →"}
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Trial Workday Section - show after trial release */}
            {(recruitingStep === RecruitingStep.RELEASE_TRIAL || 
              recruitingStep === RecruitingStep.TRIAL_WORKDAY ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS) &&
              applications.some((app) => app.trialOffers && app.trialOffers.length > 0) && (
              <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
                <h2 className="text-xl font-bold text-white mb-4">
                  🎉 Trial Workday Invite
                </h2>
                {applications
                  .filter((app) => app.trialOffers && app.trialOffers.length > 0)
                  .map((app) => {
                    const trialOffer = app.trialOffers![0];
                    const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
                    const hasResponded = trialOffer.accepted !== undefined;
                    
                    return (
                      <div 
                        key={app.id}
                        className="p-4 rounded-lg bg-black/50 border border-purple-500/20"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">{teamInfo?.icon}</span>
                          <div>
                            <h3 className="font-medium text-white">
                              {teamInfo?.name} - {trialOffer.system}
                            </h3>
                            <p className="text-sm text-neutral-400">
                              Trial Workday Invitation
                            </p>
                          </div>
                        </div>
                        
                        {hasResponded ? (
                          <div className={`p-3 rounded-lg ${trialOffer.accepted ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <p className={`text-sm font-medium ${trialOffer.accepted ? 'text-green-400' : 'text-red-400'}`}>
                              {trialOffer.accepted ? '✅ You accepted this trial workday' : '❌ You declined this trial workday'}
                            </p>
                            {trialOffer.rejectionReason && (
                              <p className="text-xs text-neutral-400 mt-1">
                                Reason: {trialOffer.rejectionReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <TrialOfferResponse 
                            applicationId={app.id} 
                            system={trialOffer.system}
                            onResponse={() => {
                              mutate();
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Quick Apply Section */}
            {availableTeams.length > 0 && applications.length > 0 && isApplicationsOpen && (
              <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5">
                <h2 className="text-xl font-bold text-white mb-4">
                  Apply to More Teams
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {availableTeams.map((teamInfo) => (
                    <Link
                      key={teamInfo.team}
                      href={routes.applyTeam(teamInfo.team)}
                      className="p-4 rounded-lg bg-black/50 border border-white/5 hover:border-opacity-50 transition-all text-center group"
                      style={
                        { "--team-color": teamInfo.color } as React.CSSProperties
                      }
                    >
                      <span className="text-3xl block mb-2">
                        {teamInfo.icon}
                      </span>
                      <span
                        className="text-sm font-medium text-white group-hover:transition-colors"
                        style={{ color: teamInfo.color }}
                      >
                        {teamInfo.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Announcements Card */}
            <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 hover:border-[#FFB526]/50 transition-colors">
              <h2 className="text-xl font-bold text-white mb-4">
                Announcements
              </h2>
              <div className="space-y-4">
                {/* Custom Admin Announcement */}
                {announcement && (
                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <span className="text-xs font-medium text-orange-400 mb-1 block">
                      📢 Important
                    </span>
                    <p className="text-sm text-white whitespace-pre-wrap">
                      {announcement.message}
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-black/50 border border-white/5">
                  <span className="text-xs font-medium text-[#FFB526] mb-1 block">
                    {isApplicationsOpen ? "New" : "Notice"}
                  </span>
                  <h3 className="text-sm font-bold text-white mb-1">
                    {isApplicationsOpen 
                        ? "Applications Open" 
                        : "Applications Closed"}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {isApplicationsOpen
                        ? "We're now accepting applications for the Spring 2025 semester!"
                        : "Applications are no longer being accepted at this time."}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-black/50 border border-white/5">
                  <h3 className="text-sm font-bold text-white mb-1">
                    Info Sessions
                  </h3>
                  <p className="text-xs text-neutral-400">
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
    <Suspense fallback={<div className="min-h-screen bg-black pt-24 pb-20 flex items-center justify-center text-neutral-500">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
