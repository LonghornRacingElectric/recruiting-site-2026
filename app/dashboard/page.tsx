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
import { getBrandTeamColor } from "@/lib/teamColors";



function getStatusStyle(status: ApplicationStatus) {
  const styles: Record<string, { bg: string; border: string; text: string; label: string }> = {
    [ApplicationStatus.IN_PROGRESS]: {
      bg: "var(--status-warn-bg)",
      border: "var(--status-warn-border)",
      text: "var(--status-warn-ink)",
      label: "In Progress",
    },
    [ApplicationStatus.SUBMITTED]: {
      bg: "var(--status-submitted-bg)",
      border: "var(--status-submitted-border)",
      text: "var(--status-submitted-ink)",
      label: "Submitted",
    },
    [ApplicationStatus.INTERVIEW]: {
      bg: "var(--status-info-bg)",
      border: "var(--status-info-border)",
      text: "var(--status-info-ink)",
      label: "Interview",
    },
    [ApplicationStatus.ACCEPTED]: {
      bg: "var(--status-success-bg)",
      border: "var(--status-success-border)",
      text: "var(--status-success-ink)",
      label: "Accepted",
    },
    [ApplicationStatus.REJECTED]: {
      bg: "var(--status-error-bg)",
      border: "var(--status-error-border)",
      text: "var(--status-error-ink)",
      label: "Not Selected",
    },
    [ApplicationStatus.TRIAL]: {
      bg: "var(--status-trial-bg)",
      border: "var(--status-trial-border)",
      text: "var(--status-trial-ink)",
      label: "Trial Workday",
    },
    [ApplicationStatus.WAITLISTED]: {
      bg: "var(--status-waitlist-bg)",
      border: "var(--status-waitlist-border)",
      text: "var(--status-waitlist-ink)",
      label: "Waitlisted",
    },
    [ApplicationStatus.COMMITTED]: {
      bg: "var(--status-success-bg)",
      border: "var(--status-success-border)",
      text: "var(--status-success-ink)",
      label: "Committed",
    },
    [ApplicationStatus.DECLINED]: {
      bg: "var(--status-error-bg)",
      border: "var(--status-error-border)",
      text: "var(--status-error-ink)",
      label: "Declined",
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
          style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-ink)', border: '1px solid var(--status-success-border)' }}
        >
          {loading ? "..." : "Accept"}
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={loading}
          className="flex-1 h-10 px-4 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'var(--pub-surface-2)', color: 'var(--pub-text)', border: '1px solid var(--pub-border)' }}
        >
          Decline
        </button>
      </div>

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: "var(--pub-scrim)" }}>
          <div
            className="rounded-xl p-7 max-w-md w-full mx-4"
            style={{ backgroundColor: 'var(--pub-menu-bg)', border: '1px solid var(--pub-menu-border)', boxShadow: 'var(--pub-shadow)' }}
          >
            <h3 className="text-lg font-bold mb-2" style={{ color: "var(--pub-heading)" }}>Decline Trial Workday</h3>
            <p className="font-urbanist text-[14px] mb-5" style={{ color: "var(--pub-text-2)" }}>
              Please let us know why you&apos;re declining the {system} trial workday.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Schedule conflict, accepted another offer, etc."
              className="w-full h-24 p-3 rounded-lg text-[14px] text-[var(--pub-text-strong)] placeholder:text-[var(--pub-text-3)] focus:outline-none focus:ring-1 mb-5 font-urbanist"
              style={{ backgroundColor: 'var(--pub-field)', border: '1px solid var(--pub-border)', outlineColor: 'var(--lhr-blue)' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={loading}
                className="flex-1 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200"
                style={{ backgroundColor: 'var(--pub-surface-2)', color: 'var(--pub-text)', border: '1px solid var(--pub-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 disabled:opacity-40"
                style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error-ink)', border: '1px solid var(--status-error-border)' }}
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

// Commitment Picker Component
function CommitmentPicker({
  applications,
  onResponse
}: {
  applications: any[];
  onResponse: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [decliningApp, setDecliningApp] = useState<any | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const acceptedApps = applications.filter(app => app.status === ApplicationStatus.ACCEPTED);
  // A prior final acceptance — accepting a new offer now is a reneg and
  // permanently withdraws it (only possible from round 2, server-enforced).
  const committedApp = applications.find(app => app.status === ApplicationStatus.COMMITTED);

  if (acceptedApps.length === 0) return null;

  const handleCommit = async () => {
    if (!selectedAppId) return;
    setLoading(selectedAppId);
    try {
      // One request (#65): the server declines the other offers inside the
      // same transaction as the commit, so a failure part-way can no longer
      // leave the applicant declined everywhere and committed nowhere.
      const declineReasons = Object.fromEntries(
        acceptedApps
          .filter((app) => app.id !== selectedAppId)
          .map((app) => [app.id, rejectionReasons[app.id] || "Committed to another team"])
      );
      const res = await fetch(`/api/applications/${selectedAppId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, declineReasons }),
      });

      if (res.ok) {
        toast.success("Congratulations! You have committed to the team.");
        onResponse();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to commit");
      }
    } catch (e) {
      toast.error("Failed to process commitment");
    } finally {
      setLoading(null);
      setShowConfirmModal(false);
    }
  };

  // Turning an offer down. The endpoint has always accepted this; until now
  // nothing in the UI called it, so the only way to say no was to let the
  // offer lapse into an auto-rejection at the next decision release — and a
  // day-3 offer, with no advance left to sweep it, never lapsed at all.
  // respondToCommitment touches other applications only when accepting, so
  // this cannot disturb an existing commitment elsewhere.
  const handleDecline = async () => {
    if (!decliningApp) return;
    setLoading(decliningApp.id);
    try {
      const res = await fetch(`/api/applications/${decliningApp.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: false, reason: declineReason.trim() || undefined }),
      });

      if (res.ok) {
        toast.success("Your response has been recorded.");
        onResponse();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to decline the offer");
      }
    } catch (e) {
      toast.error("Failed to decline the offer");
    } finally {
      setLoading(null);
      setDecliningApp(null);
      setDeclineReason("");
    }
  };

  return (
    <div
      className="mb-8 rounded-xl overflow-hidden animate-fade-slide-up"
      style={{
        background: 'linear-gradient(135deg, var(--status-success-bg) 0%, transparent 100%)',
        border: '1px solid var(--status-success-border)'
      }}
    >
      <div className="px-5 sm:px-7 pt-6 pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--pub-heading)" }}>
          <span className="text-2xl">🎊</span> {committedApp ? "A new offer" : "Congratulations!"}
        </h2>
        <p className="font-urbanist text-[14px] mt-1" style={{ color: "var(--pub-text)" }}>
          {committedApp
            ? `Another team has made you an offer since you committed to ${committedApp.team}. You can stay where you are, or switch to the offer below.`
            : acceptedApps.length > 1
            ? "You have been accepted to multiple systems! Please select the one you would like to commit to."
            : "You have been accepted to the team! Please confirm your commitment to join."}
        </p>
        {/* "Final" is true of a first commitment only — a later offer can be
            taken instead (reneg), so don't claim otherwise once one exists. */}
        <p className="font-urbanist text-[13px] mt-2" style={{ color: 'var(--status-warn-ink)' }}>
          {committedApp
            ? "Offers expire: respond before the next decision release or this offer is automatically withdrawn."
            : "Your choice is final, and offers expire: respond before the next decision release or this offer is automatically withdrawn."}
        </p>
        {committedApp && (
          <div
            className="mt-3 p-3 rounded-lg font-urbanist text-[13px] leading-relaxed"
            style={{ backgroundColor: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)', color: 'var(--status-error-ink)' }}
          >
            You have already committed to {committedApp.team}. Accepting an offer below
            permanently withdraws that acceptance — it will show as rejected and cannot be
            recovered.
          </div>
        )}
      </div>

      <div className="px-5 sm:px-7 pb-7 mt-4 space-y-4">
        {acceptedApps.map((app) => {
          const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
          const systemName = app.offer?.system || app.preferredSystems?.[0] || "Team Member";

          return (
            <div
              key={app.id}
              className="p-5 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: selectedAppId === app.id ? 'var(--pub-surface-2)' : 'var(--pub-surface)',
                border: '1px solid',
                borderColor: selectedAppId === app.id ? 'var(--status-success-border)' : 'var(--pub-border)'
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div
                    className="w-1 h-10 rounded-full shrink-0"
                    style={{ backgroundColor: getBrandTeamColor(teamInfo?.name) }}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-bold truncate" style={{ color: "var(--pub-heading)" }}>
                      {teamInfo?.name} &mdash; {systemName}
                    </h3>
                    <p className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-2)" }}>
                      Accepted Offer
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <button
                    onClick={() => setSelectedAppId(app.id)}
                    className="flex-1 sm:flex-none px-6 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200"
                    style={{
                      backgroundColor: selectedAppId === app.id ? 'var(--status-success-bg)' : 'var(--pub-surface-2)',
                      color: selectedAppId === app.id ? 'var(--status-success-ink)' : 'var(--pub-text-2)',
                      border: '1px solid',
                      borderColor: selectedAppId === app.id ? 'var(--status-success-border)' : 'var(--pub-border-strong)'
                    }}
                  >
                    {selectedAppId === app.id ? "Selected" : "Select"}
                  </button>
                  <button
                    onClick={() => { setDecliningApp(app); setDeclineReason(""); }}
                    disabled={loading !== null}
                    className="flex-1 sm:flex-none px-5 h-10 rounded-lg font-semibold text-[13px] tracking-wide transition-all duration-200 disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--pub-surface-2)',
                      color: 'var(--status-error-ink)',
                      border: '1px solid var(--status-error-border)'
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>

              {selectedAppId !== null && selectedAppId !== app.id && (
                <div className="mt-4 animate-fade-in">
                  <label className="block text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pub-text-2)" }}>
                    Reason for declining {teamInfo?.name} (optional)
                  </label>
                  <textarea
                    value={rejectionReasons[app.id] || ""}
                    onChange={(e) => setRejectionReasons({ ...rejectionReasons, [app.id]: e.target.value })}
                    placeholder="e.g., Better fit with another system, schedule conflicts, etc."
                    className="w-full h-20 p-3 rounded-lg text-[13px] text-[var(--pub-text-strong)] placeholder:text-[var(--pub-text-3)] focus:outline-none focus:ring-1 font-urbanist"
                    style={{ backgroundColor: 'var(--pub-field)', border: '1px solid var(--pub-border)', outlineColor: 'var(--status-success-border)' }}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-4 flex justify-stretch sm:justify-end">
          <button
            disabled={!selectedAppId || loading !== null}
            onClick={() => setShowConfirmModal(true)}
            className="w-full sm:w-auto h-12 px-10 rounded-xl font-bold text-[14px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
            style={{
              backgroundColor: '#4ade80',
              color: '#064e3b',
              boxShadow: '0 4px 14px 0 rgba(34,197,94,0.39)'
            }}
          >
            Confirm Commitment
          </button>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-md p-4" style={{ backgroundColor: "var(--pub-scrim)" }}>
          <div
            className="rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl"
            style={{ backgroundColor: 'var(--pub-menu-bg)', border: '1px solid var(--pub-menu-border)', boxShadow: 'var(--pub-shadow)' }}
          >
            <h3 className="text-xl font-bold mb-3" style={{ color: "var(--pub-heading)" }}>Finalize Your Decision?</h3>
            <p className="font-urbanist text-[15px] mb-6 leading-relaxed" style={{ color: "var(--pub-text-2)" }}>
              {committedApp
                ? `This withdraws your accepted offer with ${committedApp.team} and commits you to the new team instead. This action cannot be undone. Are you sure?`
                : acceptedApps.length > 1
                ? "Once you commit to a team, your other offers will be automatically declined. This action cannot be undone. Are you sure you want to proceed?"
                : "This will finalize your commitment to join the team. This action cannot be undone. Are you sure you want to proceed?"}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={loading !== null}
                className="flex-1 h-11 rounded-xl font-semibold text-[14px] transition-all duration-200"
                style={{ backgroundColor: 'var(--pub-surface-2)', color: 'var(--pub-text)', border: '1px solid var(--pub-border-strong)' }}
              >
                Go Back
              </button>
              <button
                onClick={handleCommit}
                disabled={loading !== null}
                className="flex-1 h-11 rounded-xl font-bold text-[14px] transition-all duration-200"
                style={{ backgroundColor: '#4ade80', color: '#064e3b' }}
              >
                {loading ? "Processing..." : "Yes, I'm Sure"}
              </button>
            </div>
          </div>
        </div>
      )}

      {decliningApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-md p-4" style={{ backgroundColor: "var(--pub-scrim)" }}>
          <div
            className="rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl"
            style={{ backgroundColor: 'var(--pub-menu-bg)', border: '1px solid var(--pub-menu-border)', boxShadow: 'var(--pub-shadow)' }}
          >
            <h3 className="text-xl font-bold mb-3" style={{ color: "var(--pub-heading)" }}>
              Decline {TEAM_INFO.find((t) => t.team === decliningApp.team)?.name || decliningApp.team}?
            </h3>
            <p className="font-urbanist text-[15px] mb-5 leading-relaxed" style={{ color: "var(--pub-text-2)" }}>
              This turns the offer down for good and cannot be undone.
              {committedApp && committedApp.id !== decliningApp.id
                ? ` Your commitment to ${committedApp.team} is not affected.`
                : ""}
            </p>
            <label className="block text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--pub-text-2)" }}>
              Reason (optional)
            </label>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g., Committed elsewhere, schedule conflicts, etc."
              className="w-full h-20 p-3 rounded-lg text-[13px] text-[var(--pub-text-strong)] placeholder:text-[var(--pub-text-3)] focus:outline-none focus:ring-1 font-urbanist mb-6"
              style={{ backgroundColor: 'var(--pub-field)', border: '1px solid var(--pub-border)', outlineColor: 'var(--status-error-border)' }}
            />
            <div className="flex gap-4">
              <button
                onClick={() => { setDecliningApp(null); setDeclineReason(""); }}
                disabled={loading !== null}
                className="flex-1 h-11 rounded-xl font-semibold text-[14px] transition-all duration-200"
                style={{ backgroundColor: 'var(--pub-surface-2)', color: 'var(--pub-text)', border: '1px solid var(--pub-border-strong)' }}
              >
                Go Back
              </button>
              <button
                onClick={handleDecline}
                disabled={loading !== null}
                className="flex-1 h-11 rounded-xl font-bold text-[14px] transition-all duration-200"
                style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error-ink)', border: '1px solid var(--status-error-border)' }}
              >
                {loading ? "Processing..." : "Yes, Decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
  const isPreOpen = recruitingStep === RecruitingStep.PRE_OPEN;

  // Handle errors / showing closed status
  const handleApplyClick = (e: React.MouseEvent) => {
    if (!isApplicationsOpen) {
      e.preventDefault();
      toast.error(isPreOpen ? "Applications aren't open yet." : "Applications are currently closed.");
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div className="pub-page-bg" />

      <div className="container mx-auto px-4 sm:px-6 md:px-10 max-w-6xl">
        {/* Success Message */}
        {showSuccessMessage && (
          <div
            className="mb-6 px-5 py-4 rounded-lg text-[13px] font-medium flex items-center gap-3 animate-fade-slide-up"
            style={{
              backgroundColor: 'var(--status-success-bg)',
              border: '1px solid var(--status-success-border)',
              color: 'var(--status-success-ink)',
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

        {/* Pre-open Banner — the cycle hasn't started; distinct from "closed"
            so early visitors don't think they missed it */}
        {isPreOpen && (
          <div
            className="mb-6 px-5 py-4 rounded-lg text-[13px] font-medium flex items-center gap-3"
            style={{
              backgroundColor: 'var(--status-warn-bg)',
              border: '1px solid var(--status-warn-border)',
            }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--status-warn-ink)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style={{ color: "var(--pub-text)" }}><strong style={{ color: "var(--pub-text-strong)" }}>Applications aren&apos;t open yet.</strong> You&apos;re early — check back soon. When the cycle opens, you&apos;ll apply right from here.</span>
          </div>
        )}

        {/* Closed Banner */}
        {!isApplicationsOpen && !isPreOpen && (
          <div
            className="mb-6 px-5 py-4 rounded-lg text-[13px] font-medium flex items-center gap-3"
            style={{
              backgroundColor: 'var(--status-error-bg)',
              border: '1px solid var(--status-error-border)',
              color: 'var(--status-error-ink)',
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
            style={{ color: 'var(--pub-text-3)' }}
          >
            Applicant Portal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: 'var(--pub-heading)' }}>
            Your Dashboard
          </h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 min-w-0">
          {/* Applications Section */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Commitment Picker for Accepted Students */}
            <CommitmentPicker
              applications={applications}
              onResponse={mutate}
            />

            {/* Your Applications Card */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'var(--pub-surface)', border: '1px solid var(--pub-border)' }}
            >
              <div className="px-5 sm:px-7 pt-6 pb-5 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--pub-heading)' }}>Your Applications</h2>
                {availableTeams.length > 0 && isApplicationsOpen && (
                  <Link
                    href={routes.apply}
                    className="flex items-center gap-1.5 text-[13px] font-medium tracking-wide transition-colors duration-200 whitespace-nowrap"
                    style={{ color: 'var(--pub-link)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">New Application</span>
                    <span className="sm:hidden">New</span>
                  </Link>
                )}
              </div>

              <div className="px-5 sm:px-7 pb-7">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <svg className="animate-spin h-5 w-5 text-[var(--pub-text-3)]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : applications.length === 0 ? (
                  <div className="text-center py-14">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"
                      style={{ backgroundColor: 'var(--pub-chip-blue-bg)' }}
                    >
                      <svg className="w-5 h-5" style={{ color: 'var(--pub-chip-blue-ink)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: "var(--pub-heading)" }}>No applications yet</h3>
                    <p className="font-urbanist text-[14px] mb-6 max-w-xs mx-auto" style={{ color: "var(--pub-text-2)" }}>
                      {isApplicationsOpen
                        ? "Start your journey by applying to one of our teams."
                        : "Applications are closed for this cycle."}
                    </p>
                    {isApplicationsOpen && (
                      <Link
                        href={routes.apply}
                        className="inline-flex h-10 items-center justify-center rounded-lg px-6 text-[13px] font-semibold tracking-wide transition-all duration-200"
                        style={{ backgroundColor: 'var(--pub-cta)', color: 'var(--pub-cta-ink)' }}
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
                      const teamColor = getBrandTeamColor(teamInfo?.name);

                      const linkHref = isInProgress && isApplicationsOpen
                        ? routes.applyTeam(app.team)
                        : `/dashboard/applications/${app.id}`;

                      // Submitted applications stay editable until applications
                      // close. In-progress ones already open the form directly.
                      const canEdit =
                        isApplicationsOpen && app.status === ApplicationStatus.SUBMITTED;

                      return (
                        <div
                          key={app.id}
                          className="group relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg transition-all duration-200"
                          style={{
                            backgroundColor: 'var(--pub-field)',
                            border: '1px solid var(--pub-border)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--pub-border-strong)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--pub-border)';
                          }}
                        >
                          {/* Whole-card click target. Kept as an overlay so the
                              Edit button below isn't a nested anchor. */}
                          <Link
                            href={linkHref}
                            aria-label={`${teamInfo?.name} application`}
                            className="absolute inset-0 rounded-lg"
                          />
                          <div className="flex items-center gap-4 min-w-0 flex-1 pointer-events-none">
                            {/* Team color indicator */}
                            <div
                              className="w-1 h-10 rounded-full shrink-0"
                              style={{ backgroundColor: teamColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[14px] font-semibold truncate" style={{ color: "var(--pub-heading)" }}>
                                {teamInfo?.name} Application
                              </h3>
                              {app.preferredSystems?.length ? (
                                <p className="font-urbanist text-[12px] mt-0.5 truncate" style={{ color: "var(--pub-text-2)" }}>
                                  {app.preferredSystems
                                    .map((sys: string, idx: number) => `#${idx + 1} ${sys}`)
                                    .join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto pl-5 sm:pl-0">
                            {canEdit && (
                              <Link
                                href={routes.applyTeam(app.team)}
                                className="relative z-10 inline-flex items-center h-7 px-3 rounded-md text-[12px] font-semibold transition-colors"
                                style={{
                                  backgroundColor: 'var(--pub-surface-2)',
                                  border: '1px solid var(--pub-border-strong)',
                                  color: 'var(--pub-text)',
                                }}
                              >
                                Edit
                              </Link>
                            )}
                            {/* Status badge */}
                            <span
                              className="px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-md whitespace-nowrap"
                              style={{
                                backgroundColor: statusStyle.bg,
                                border: `1px solid ${statusStyle.border}`,
                                color: statusStyle.text,
                              }}
                            >
                              {!isApplicationsOpen && isInProgress ? "Not Submitted" : statusStyle.label}
                            </span>
                            <svg
                              className="hidden sm:block w-4 h-4 text-[var(--pub-text-3)] opacity-60 group-hover:opacity-100 transition-all duration-200"
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </div>
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
                  style={{ backgroundColor: 'var(--status-trial-bg)', border: '1px solid var(--status-trial-border)' }}
                >
                  <div className="px-5 sm:px-7 pt-6 pb-2">
                    <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--pub-heading)' }}>
                      Trial Workday Invite
                    </h2>
                  </div>
                  <div className="px-5 sm:px-7 pb-7">
                    {applications
                      .filter((app) =>
                        app.status === ApplicationStatus.TRIAL &&
                        app.trialOffers && app.trialOffers.length > 0
                      )
                      .map((app) => {
                        const trialOffer = app.trialOffers![0];
                        const teamInfo = TEAM_INFO.find((t) => t.team === app.team);
                        const hasResponded = trialOffer.accepted !== undefined;
                        const teamColor = getBrandTeamColor(teamInfo?.name);

                        return (
                          <div
                            key={app.id}
                            className="p-4 rounded-lg"
                            style={{ backgroundColor: 'var(--pub-field)', border: '1px solid var(--pub-border)' }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-1 h-8 rounded-full shrink-0"
                                style={{ backgroundColor: teamColor }}
                              />
                              <div>
                                <h3 className="text-[14px] font-semibold" style={{ color: "var(--pub-heading)" }}>
                                  {teamInfo?.name} &mdash; {trialOffer.system}
                                </h3>
                                <p className="font-urbanist text-[12px] mt-0.5" style={{ color: "var(--pub-text-2)" }}>
                                  Trial Workday Invitation
                                </p>
                              </div>
                            </div>

                            {hasResponded ? (
                              <div
                                className="mt-4 p-3 rounded-lg text-[13px] font-medium"
                                style={{
                                  backgroundColor: trialOffer.accepted ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                                  border: `1px solid ${trialOffer.accepted ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
                                  color: trialOffer.accepted ? 'var(--status-success-ink)' : 'var(--status-error-ink)',
                                }}
                              >
                                {trialOffer.accepted ? 'You accepted this trial workday' : 'You declined this trial workday'}
                                {trialOffer.rejectionReason && (
                                  <p className="text-[12px] mt-1 font-normal" style={{ color: "var(--pub-text-2)" }}>
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
                style={{ backgroundColor: 'var(--pub-surface)', border: '1px solid var(--pub-border)' }}
              >
                <div className="px-5 sm:px-7 pt-6 pb-1 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--pub-heading)' }}>Apply to More Teams</h2>
                  <span className="text-[11px] font-semibold tracking-widest uppercase whitespace-nowrap" style={{ color: 'var(--pub-text-3)' }}>
                    {availableTeams.length} available
                  </span>
                </div>
                <p className="px-5 sm:px-7 pb-5 font-urbanist text-[13px]" style={{ color: "var(--pub-text-2)" }}>
                  You can apply to multiple teams. Each application is reviewed independently.
                </p>
                <div className="px-5 sm:px-7 pb-7 space-y-2">
                  {availableTeams.map((teamInfo) => (
                    <Link
                      key={teamInfo.team}
                      href={routes.applyTeam(teamInfo.team)}
                      className="group flex items-center gap-4 p-4 rounded-lg transition-all duration-200"
                      style={{
                        backgroundColor: 'var(--pub-field)',
                        border: '1px solid var(--pub-border)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${getBrandTeamColor(teamInfo.name)}70`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--pub-border)';
                      }}
                    >
                      {/* Team color bar */}
                      <div
                        className="w-1 h-10 rounded-full shrink-0 transition-all duration-200 group-hover:h-12"
                        style={{ backgroundColor: getBrandTeamColor(teamInfo.name) }}
                      />
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-semibold" style={{ color: "var(--pub-heading)" }}>
                          {teamInfo.name}
                        </h3>
                        <p className="font-urbanist text-[12px] mt-0.5 line-clamp-1" style={{ color: "var(--pub-text-2)" }}>
                          {teamInfo.description}
                        </p>
                      </div>
                      {/* Arrow — always visible (hover-only doesn't work on touch) */}
                      <div
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                        style={{ backgroundColor: `${getBrandTeamColor(teamInfo.name)}22` }}
                      >
                        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" style={{ color: `var(--team-${teamInfo.name.toLowerCase()}-ink)` }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6 min-w-0">
            {/* Announcements Card */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'var(--pub-surface)', border: '1px solid var(--pub-border)' }}
            >
              <div className="px-5 sm:px-7 pt-6 pb-2">
                <h2 className="text-lg font-semibold" style={{ color: "var(--pub-heading)" }}>Announcements</h2>
              </div>
              <div className="px-5 sm:px-7 pb-7 space-y-3">
                {/* Custom Admin Announcement */}
                {announcement && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255,148,4,0.06)',
                      border: '1px solid rgba(255,148,4,0.20)',
                    }}
                  >
                    <span className="text-[11px] font-semibold tracking-widest uppercase block mb-1.5" style={{ color: 'var(--team-solar-ink)' }}>
                      Important
                    </span>
                    <p className="font-urbanist text-[14px] whitespace-pre-wrap break-words leading-relaxed" style={{ color: "var(--pub-text)" }}>
                      {announcement.message}
                    </p>
                  </div>
                )}

                {/* Status card mirrors the top-of-page banner: open / not open yet / closed */}
                <div
                  className="p-4 rounded-lg"
                  style={{ backgroundColor: 'var(--pub-field)', border: '1px solid var(--pub-border)' }}
                >
                  <span
                    className="text-[11px] font-semibold tracking-widest uppercase block mb-1.5"
                    style={{ color: isApplicationsOpen || isPreOpen ? 'var(--status-warn-ink)' : 'var(--pub-text-3)' }}
                  >
                    {isApplicationsOpen ? "Open" : isPreOpen ? "Coming Soon" : "Notice"}
                  </span>
                  <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--pub-heading)" }}>
                    {isApplicationsOpen ? "Applications Open" : isPreOpen ? "Applications Open Soon" : "Applications Closed"}
                  </h3>
                  <p className="font-urbanist text-[12px] leading-relaxed" style={{ color: "var(--pub-text-2)" }}>
                    {isApplicationsOpen
                      ? "We're now accepting applications for the upcoming semester!"
                      : isPreOpen
                        ? "The recruiting cycle hasn't started yet — check back soon."
                        : "Applications are no longer being accepted at this time."}
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
        <div className="min-h-screen pt-24 pb-20 flex items-center justify-center" style={{ background: 'var(--pub-bg)' }}>
          <svg className="animate-spin h-5 w-5 text-[var(--pub-text-3)]" fill="none" viewBox="0 0 24 24">
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
