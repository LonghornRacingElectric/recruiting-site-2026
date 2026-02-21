"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  Mail,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ExternalLink,
  Trash2,
  MessageSquare,
  Plus,
  Loader2,
  Save
} from "lucide-react";
import clsx from "clsx";
import { ApplicationStatus, InterviewOffer } from "@/lib/models/Application";
import { User, UserRole, Team } from "@/lib/models/User";
import { TEAM_SYSTEMS, SystemOption } from "@/lib/models/teamQuestions";
import { Note, ReviewTask } from "@/lib/models/ApplicationExtras";
import { ApplicationQuestion, RecruitingStep } from "@/lib/models/Config";
import { useApplications } from "./ApplicationsContext";
import ApplicationScorecard from "./ApplicationScorecard";
import InterviewScorecard from "./InterviewScorecard";

// Helper to check if recruiting step is at or past a certain stage
const RECRUITING_STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS_DAY1,
  RecruitingStep.RELEASE_DECISIONS_DAY2,
  RecruitingStep.RELEASE_DECISIONS_DAY3,
];

function isRecruitingStepAtOrPast(currentStep: RecruitingStep | null, targetStep: RecruitingStep): boolean {
  if (!currentStep) return false;
  const currentIndex = RECRUITING_STEP_ORDER.indexOf(currentStep);
  const targetIndex = RECRUITING_STEP_ORDER.indexOf(targetStep);
  return currentIndex >= targetIndex;
}

const TEAM_COLORS: Record<string, string> = {
  Electric: "var(--lhr-blue)",
  Solar: "var(--lhr-gold)",
  Combustion: "var(--lhr-orange)",
};

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

type Tab = "application" | "resume" | "scorecard";

interface ApplicationDetailProps {
  applicationId: string;
}

// Helper to get status display label (title case)
const STATUS_LABELS: Record<string, string> = {
  [ApplicationStatus.IN_PROGRESS]: "In Progress",
  [ApplicationStatus.SUBMITTED]: "Submitted",
  [ApplicationStatus.INTERVIEW]: "Interview",
  [ApplicationStatus.ACCEPTED]: "Accepted",
  [ApplicationStatus.REJECTED]: "Rejected",
  [ApplicationStatus.TRIAL]: "Trial",
  [ApplicationStatus.WAITLISTED]: "Waitlisted",
};

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export default function ApplicationDetail({ applicationId }: ApplicationDetailProps) {
  const { applications, setApplications, currentUser, recruitingStep, loading } = useApplications();
  const [activeTab, setActiveTab] = useState<Tab>("application");

  // Selected app logic
  const selectedApp = applications.find(app => app.id === applicationId);

  // Extras State
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [newNote, setNewNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Modal States
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [selectedInterviewSystems, setSelectedInterviewSystems] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRejectSystems, setSelectedRejectSystems] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [selectedTrialSystems, setSelectedTrialSystems] = useState<string[]>([]);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptFormData, setAcceptFormData] = useState<{
    system: string;
    role: string;
    details: string;
  }>({ system: '', role: 'Member', details: '' });
  const [showInterviewDetailModal, setShowInterviewDetailModal] = useState(false);
  const [selectedInterviewOffer, setSelectedInterviewOffer] = useState<InterviewOffer | null>(null);
  const [interviewStatusUpdating, setInterviewStatusUpdating] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistFormData, setWaitlistFormData] = useState<{
    system: string;
    details: string;
  }>({ system: '', details: '' });

  // Related applications state (other teams this user applied to)
  const [relatedApps, setRelatedApps] = useState<Array<{
    id?: string;
    team: string;
    status: string;
    preferredSystems: string[];
  }>>([]);

  // Dynamic questions from API
  const [teamQuestions, setTeamQuestions] = useState<ApplicationQuestion[]>([]);

  // Fetch extras when app changes
  useEffect(() => {
    if (!applicationId) return;

    fetch(`/api/admin/applications/${applicationId}/notes`)
      .then(res => res.json())
      .then(data => setNotes(data.notes || []));

    fetch(`/api/admin/applications/${applicationId}/tasks`)
      .then(res => res.json())
      .then(data => setTasks(data.tasks || []));

    // Fetch related applications (other teams this user applied to)
    fetch(`/api/admin/applications/${applicationId}/related`)
      .then(res => res.json())
      .then(data => setRelatedApps(data.applications || []))
      .catch(() => setRelatedApps([]));
  }, [applicationId]);

  // Fetch questions when selected app changes
  useEffect(() => {
    if (!selectedApp?.team) return;
    const team = selectedApp.team;

    fetch(`/api/questions?team=${team}`)
      .then(res => res.json())
      .then(data => setTeamQuestions(data.teamQuestions || []))
      .catch(() => setTeamQuestions([]));
  }, [selectedApp?.team]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "#030608" }}>
        <Loader2 className="h-7 w-7 animate-spin mb-4" style={{ color: "var(--lhr-blue)" }} />
        <p className="font-urbanist text-[13px] text-white/30">Loading application...</p>
      </div>
    );
  }

  if (!selectedApp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "#030608" }}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "rgba(255,181,38,0.08)", border: "1px solid rgba(255,181,38,0.15)" }}
        >
          <FileText className="h-6 w-6" style={{ color: "var(--lhr-gold)" }} />
        </div>
        <p className="font-montserrat text-[15px] font-semibold text-white/40">Application not found</p>
        <p className="font-urbanist text-[13px] text-white/20 mt-1">Try refreshing the page.</p>
      </div>
    );
  }

  const teamColor = TEAM_COLORS[selectedApp.team] || "var(--lhr-blue)";

  // Define Handlers
  const handleSystemOptions = (): SystemOption[] => TEAM_SYSTEMS[selectedApp.team as Team] || [];

  const handleStatusUpdate = async (status: ApplicationStatus, systems?: string[], offer?: any) => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, systems, offer }),
      });
      const data = await res.json();

      if (res.ok && data.application) {
        setApplications(prev => prev.map(a =>
          a.id === applicationId
            ? { ...a, ...data.application, user: a.user }
            : a
        ));
        toast.success(`Status updated to ${status.replace("_", " ")}`);
        setShowInterviewModal(false);
        setShowTrialModal(false);
        setShowAcceptModal(false);
      } else {
        toast.error(data.error || "Failed to update status");
      }
    } catch (e) {
      console.error("Failed to update status", e);
      toast.error("Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAdvanceClick = () => {
    const isTrialMode = recruitingStep === RecruitingStep.INTERVIEWING;
    const isDecisionMode = recruitingStep === RecruitingStep.RELEASE_TRIAL ||
      recruitingStep === RecruitingStep.TRIAL_WORKDAY ||
      recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY1 ||
      recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY2 ||
      recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY3;

    if (isDecisionMode) {
      setAcceptFormData({
        system: selectedApp.preferredSystems?.[0] || '',
        role: 'Member',
        details: ''
      });
      setShowAcceptModal(true);
      return;
    }

    if (isTrialMode) {
      const existingOfferSystems = selectedApp.trialOffers?.map(o => o.system) || [];
      setSelectedTrialSystems(existingOfferSystems);
      setShowTrialModal(true);
    } else {
      const existingOfferSystems = selectedApp.interviewOffers?.map(o => o.system) || [];
      setSelectedInterviewSystems(existingOfferSystems);
      setShowInterviewModal(true);
    }
  };

  const handleWaitlistClick = () => {
    setWaitlistFormData({
      system: selectedApp.preferredSystems?.[0] || '',
      details: ''
    });
    setShowWaitlistModal(true);
  };

  const handleRejectClick = () => {
    const isHigherAuthority = currentUser?.role === UserRole.ADMIN ||
      currentUser?.role === UserRole.TEAM_CAPTAIN_OB;

    const existingOfferSystems = selectedApp.interviewOffers?.map(o => o.system) || [];

    if (isHigherAuthority) {
      setSelectedRejectSystems(existingOfferSystems);
    } else {
      const userSystem = currentUser?.memberProfile?.system;
      if (userSystem && existingOfferSystems.includes(userSystem)) {
        setSelectedRejectSystems([userSystem]);
      } else {
        setSelectedRejectSystems([]);
      }
    }
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (selectedRejectSystems.length === 0) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: selectedRejectSystems }),
      });
      const data = await res.json();

      if (res.ok && data.application) {
        setApplications(prev => prev.map(a =>
          a.id === applicationId
            ? { ...a, ...data.application, user: a.user }
            : a
        ));
        toast.success(`Rejected from ${selectedRejectSystems.length} system(s)`);
        setShowRejectModal(false);
      } else {
        toast.error(data.error || "Failed to reject");
      }
    } catch (e) {
      console.error("Failed to reject", e);
      toast.error("Failed to reject");
    } finally {
      setStatusLoading(false);
    }
  };

  // Add Note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSendingNote(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: newNote }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => [data.note, ...prev]);
        setNewNote("");
      }
    } finally {
      setSendingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
    await fetch(`/api/admin/applications/${applicationId}/notes/${noteId}`, {
      method: "DELETE",
    });
  };

  // Task Handlers
  const handleAddTask = async () => {
    if (!newTaskDescription.trim()) return;
    setIsAddingTask(false);
    const res = await fetch(`/api/admin/applications/${applicationId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ description: newTaskDescription }),
    });
    if (res.ok) {
      const data = await res.json();
      setTasks(prev => [...prev, data.task]);
      setNewTaskDescription("");
    }
  };

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isCompleted, completedAt: isCompleted ? new Date() : undefined } : t));
    await fetch(`/api/admin/applications/${applicationId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ isCompleted }),
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await fetch(`/api/admin/applications/${applicationId}/tasks/${taskId}`, {
      method: "DELETE",
    });
  };

  // Edit Handlers
  const handleOpenEditModal = () => {
    setEditFormData({
      team: selectedApp.team,
      preferredSystems: selectedApp.preferredSystems || [],
      graduationYear: selectedApp.formData.graduationYear || "",
      major: selectedApp.formData.major || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: editFormData.team,
          preferredSystems: editFormData.preferredSystems,
          formData: {
            graduationYear: editFormData.graduationYear,
            major: editFormData.major,
          }
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setApplications(prev => prev.map(a =>
          a.id === applicationId
            ? { ...a, ...data.application, user: a.user }
            : a
        ));
        setShowEditModal(false);
        toast.success("Application updated!");
      } else {
        toast.error("Failed to update application");
      }
    } catch (err) {
      toast.error("Failed to update application");
    } finally {
      setEditSaving(false);
    }
  };

  const handleUpdateInterviewStatus = async (newStatus: 'completed' | 'cancelled' | 'no_show', cancelReason?: string) => {
    if (!selectedInterviewOffer) return;
    setInterviewStatusUpdating(true);
    try {
      const res = await fetch(
        `/api/admin/applications/${applicationId}/interview/${encodeURIComponent(selectedInterviewOffer.system)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, cancelReason }),
        }
      );
      const data = await res.json();

      if (res.ok && data.application) {
        setApplications(prev => prev.map(a =>
          a.id === applicationId
            ? { ...a, ...data.application, user: a.user }
            : a
        ));
        toast.success(`Interview marked as ${newStatus.replace("_", " ")}`);
        setShowInterviewDetailModal(false);
        setSelectedInterviewOffer(null);
      } else {
        toast.error(data.error || "Failed to update interview status");
      }
    } catch (e) {
      console.error("Failed to update interview status", e);
      toast.error("Failed to update interview status");
    } finally {
      setInterviewStatusUpdating(false);
    }
  };

  // Render logic...
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Center Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#030608" }}>
        {/* Header */}
        <div className="p-8" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Team accent stripe */}
          <div className="h-0.5 rounded-full mb-6 w-24" style={{ backgroundColor: teamColor, opacity: 0.5 }} />
          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              <div
                className="h-20 w-20 rounded-xl flex items-center justify-center shrink-0 font-montserrat text-2xl font-bold"
                style={{
                  backgroundColor: `color-mix(in srgb, ${teamColor} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${teamColor} 20%, transparent)`,
                  color: teamColor,
                }}
              >
                {selectedApp.user.name ? selectedApp.user.name.charAt(0).toUpperCase() : "?"}
              </div>
              <div>
                <h1 className="font-montserrat text-[26px] font-bold text-white mb-1.5">{selectedApp.user.name || "Unknown Applicant"}</h1>
                <div className="font-urbanist text-[13px] text-white/35 mb-3">
                  {selectedApp.formData.major || "Major not specified"} · Class of {selectedApp.formData.graduationYear || "N/A"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-urbanist"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${teamColor} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${teamColor} 20%, transparent)`,
                      color: teamColor,
                    }}
                  >
                    {selectedApp.team} Team
                  </span>
                  {(selectedApp.preferredSystems?.length ?? 0) > 0 && selectedApp.preferredSystems!.map(sys => (
                    <span
                      key={sys}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold font-urbanist"
                      style={{
                        backgroundColor: "rgba(4,95,133,0.08)",
                        border: "1px solid rgba(4,95,133,0.18)",
                        color: "var(--lhr-blue)",
                      }}
                    >
                      {sys}
                    </span>
                  ))}
                </div>

                {/* Also Applied To - inline in header */}
                {relatedApps.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <span className="text-[11px] font-urbanist text-white/25">Also applied to:</span>
                    {relatedApps.map((app, idx) => {
                      const isAdmin = currentUser?.role === UserRole.ADMIN;
                      const statusColor = app.status === 'rejected'
                        ? 'rgba(239,68,68,0.8)'
                        : app.status === 'accepted'
                          ? 'rgba(34,197,94,0.8)'
                          : 'rgba(255,255,255,0.5)';

                      const badge = (
                        <span
                          className="px-2 py-1 rounded-md text-[11px] font-semibold font-urbanist transition-colors"
                          style={{
                            backgroundColor: "rgba(168,85,247,0.08)",
                            border: "1px solid rgba(168,85,247,0.18)",
                            color: "rgba(168,85,247,0.8)",
                            cursor: isAdmin && app.id ? "pointer" : "default",
                          }}
                        >
                          {app.team} <span style={{ color: statusColor }}>({getStatusLabel(app.status)})</span>
                        </span>
                      );

                      if (isAdmin && app.id) {
                        return (
                          <Link key={app.id} href={`/admin/applications/${app.id}`}>
                            {badge}
                          </Link>
                        );
                      }

                      return <span key={idx}>{badge}</span>;
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`mailto:${selectedApp.user.email}`}
                className="flex items-center gap-2 font-urbanist text-[13px] text-white/30 transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
              >
                <Mail className="h-4 w-4" />
                {selectedApp.user.email}
              </a>

              {currentUser?.role === UserRole.ADMIN && (
                <button
                  onClick={() => handleOpenEditModal()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
                >
                  <Edit className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-8" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {(["application", "resume", "scorecard"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-3.5 font-montserrat text-[12px] font-semibold uppercase tracking-wider transition-colors"
              style={{
                borderBottom: activeTab === tab ? `2px solid var(--lhr-gold)` : "2px solid transparent",
                color: activeTab === tab ? "var(--lhr-gold)" : "rgba(255,255,255,0.3)",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} {tab === "resume" && "View"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === "application" && (
            <div className="space-y-8 max-w-3xl">
              <div>
                <h3 className="font-montserrat text-[15px] font-bold text-white mb-3">Why do you want to join Longhorn Racing?</h3>
                <p className="font-urbanist text-[14px] text-white/50 leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                  {selectedApp.formData.whyJoin || "No answer provided."}
                </p>
              </div>
              <div className="h-px" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
              <div>
                <h3 className="font-montserrat text-[15px] font-bold text-white mb-3">Describe a technical problem you solved recently.</h3>
                <p className="font-urbanist text-[14px] text-white/50 leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                  {selectedApp.formData.relevantExperience || "No answer provided."}
                </p>
              </div>

              {selectedApp.formData.teamQuestions && Object.entries(selectedApp.formData.teamQuestions).map(([qId, answer]) => {
                const question = teamQuestions.find((q: ApplicationQuestion) => q.id === qId);
                return (
                  <div key={qId}>
                    <div className="h-px my-8" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
                    <h3 className="font-montserrat text-[15px] font-bold text-white mb-3">{question?.label || qId}</h3>
                    <p className="font-urbanist text-[14px] text-white/50 leading-relaxed whitespace-pre-wrap break-words overflow-hidden">{answer as string}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className={clsx("flex flex-col h-full min-h-[600px]", activeTab !== "resume" && "hidden")}>
            {selectedApp.formData.resumeUrl ? (
              <>
                <div
                  className="flex justify-between items-center rounded-t-lg px-4 py-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none" }}
                >
                  <span className="font-urbanist text-[12px] font-semibold text-white/35 uppercase tracking-wider">Resume Preview</span>
                  <a
                    href={selectedApp.formData.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 font-urbanist text-[12px] font-semibold transition-colors"
                    style={{ color: "var(--lhr-blue)" }}
                  >
                    Open in New Tab <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <iframe
                  src={selectedApp.formData.resumeUrl}
                  className="w-full flex-1 bg-white rounded-b-lg h-[calc(100vh-350px)]"
                  style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  title="Resume"
                />
              </>
            ) : (
              <div
                className="flex flex-col items-center justify-center h-64 rounded-xl"
                style={{ border: "2px dashed rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.01)" }}
              >
                <FileText className="h-14 w-14 text-white/10 mb-4 mx-auto" />
                <div className="font-urbanist text-[13px] text-white/25">No resume uploaded.</div>
              </div>
            )}
          </div>

          {activeTab === "scorecard" && (
            <div className="space-y-8">
              {/* Interview Scorecard - only visible at RELEASE_INTERVIEWS or later */}
              {isRecruitingStepAtOrPast(recruitingStep, RecruitingStep.RELEASE_INTERVIEWS) && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} className="pt-8">
                  <h3 className="font-montserrat text-[15px] font-bold text-white mb-4 flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: "rgba(4,95,133,0.1)" }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" style={{ color: "var(--lhr-blue)" }} />
                    </div>
                    Interview Scorecard
                  </h3>
                  <InterviewScorecard
                    applicationId={applicationId}
                    currentUserSystem={currentUser?.memberProfile?.system}
                    isPrivilegedUser={currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.TEAM_CAPTAIN_OB}
                  />
                </div>
              )}
              {/* Application Scorecard - always visible */}
              <div>
                <h3 className="font-montserrat text-[15px] font-bold text-white mb-4 flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: "rgba(255,148,4,0.1)" }}
                  >
                    <FileText className="h-3.5 w-3.5" style={{ color: "var(--lhr-orange)" }} />
                  </div>
                  Application Review Scorecard
                </h3>
                <ApplicationScorecard
                  applicationId={applicationId}
                  currentUserSystem={currentUser?.memberProfile?.system}
                  isPrivilegedUser={currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.TEAM_CAPTAIN_OB}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <aside
        className="w-80 flex-shrink-0 overflow-y-auto p-6 space-y-6"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.04)", backgroundColor: "rgba(255,255,255,0.01)" }}
      >
        {/* Current Status */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-montserrat text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>Current Status</h3>
            <Clock className="h-3.5 w-3.5 text-white/15" />
          </div>

          {(() => {
            const statusOrder = [
              ApplicationStatus.IN_PROGRESS,
              ApplicationStatus.SUBMITTED,
              ApplicationStatus.INTERVIEW,
              ApplicationStatus.TRIAL,
              ApplicationStatus.ACCEPTED,
            ];
            const currentIndex = statusOrder.indexOf(selectedApp.status);
            const isRejected = selectedApp.status === ApplicationStatus.REJECTED;
            const progressPercent = isRejected ? 0 : ((currentIndex + 1) / statusOrder.length) * 100;

            return (
              <>
                <div className="flex justify-between items-center font-urbanist text-[10px] font-semibold uppercase tracking-wider text-white/20 mb-2">
                  <span style={currentIndex >= 0 ? { color: "var(--lhr-blue)" } : {}}>Applied</span>
                  <span style={currentIndex >= 1 ? { color: "var(--lhr-blue)" } : {}}>Review</span>
                  <span style={currentIndex >= 2 ? { color: "var(--lhr-blue)" } : {}}>Interview</span>
                  <span style={currentIndex >= 4 ? { color: "rgba(34,197,94,0.8)" } : {}}>Offer</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden mb-5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: isRejected ? '100%' : `${progressPercent}%`,
                      backgroundColor: isRejected ? "rgba(239,68,68,0.7)" : currentIndex >= 4 ? "rgba(34,197,94,0.7)" : "var(--lhr-blue)",
                    }}
                  />
                </div>
              </>
            );
          })()}

          <div
            className="rounded-lg p-3 font-urbanist text-[13px] font-semibold flex justify-between items-center mb-4"
            style={
              selectedApp.status === ApplicationStatus.REJECTED
                ? { backgroundColor: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.8)", border: "1px solid rgba(239,68,68,0.18)" }
                : selectedApp.status === ApplicationStatus.ACCEPTED
                  ? { backgroundColor: "rgba(34,197,94,0.08)", color: "rgba(34,197,94,0.8)", border: "1px solid rgba(34,197,94,0.18)" }
                  : { backgroundColor: "rgba(255,255,255,0.03)", color: "white", border: "1px solid rgba(255,255,255,0.06)" }
            }
          >
            <span>{getStatusLabel(selectedApp.status)}</span>
          </div>

          {/* Only show Advance/Reject buttons for non-reviewers */}
          {currentUser?.role !== UserRole.REVIEWER && (() => {
            const isDecisionMode = recruitingStep === RecruitingStep.RELEASE_TRIAL ||
              recruitingStep === RecruitingStep.TRIAL_WORKDAY ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY1 ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY2 ||
              recruitingStep === RecruitingStep.RELEASE_DECISIONS_DAY3;

            if (isDecisionMode) {
              return (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    disabled={statusLoading}
                    onClick={handleRejectClick}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button
                    disabled={statusLoading}
                    onClick={handleWaitlistClick}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "rgba(255,181,38,0.15)", border: "1px solid rgba(255,181,38,0.3)" }}
                  >
                    <Clock className="h-3.5 w-3.5" /> Waitlist
                  </button>
                  <button
                    disabled={statusLoading}
                    onClick={handleAdvanceClick}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Accept
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={statusLoading}
                  onClick={handleRejectClick}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button
                  disabled={statusLoading}
                  onClick={handleAdvanceClick}
                  className="flex items-center justify-center gap-2 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Advance
                </button>
              </div>
            );
          })()}
        </div>

        <div className="h-px" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />

        {/* System Status */}
        <div>
          <h3 className="font-montserrat text-[11px] font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--lhr-gray-blue)" }}>System Status</h3>

          <div className="mb-4">
            <p className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>Applicant Interests</p>
            <div className="flex flex-wrap gap-1.5">
              {(selectedApp.preferredSystems || []).length > 0 ? (
                (selectedApp.preferredSystems || []).map(sys => (
                  <span
                    key={sys}
                    className="px-2 py-0.5 text-[11px] font-semibold rounded-md font-urbanist"
                    style={{ backgroundColor: "rgba(4,95,133,0.08)", color: "var(--lhr-blue)", border: "1px solid rgba(4,95,133,0.18)" }}
                  >
                    {sys}
                  </span>
                ))
              ) : (
                <span className="font-urbanist text-[12px] text-white/20 italic">None specified</span>
              )}
            </div>
          </div>

          <div>
            <p className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>Interview Offers</p>
            {selectedApp.interviewOffers && selectedApp.interviewOffers.length > 0 ? (
              <div className="space-y-2">
                {selectedApp.interviewOffers.map((offer, idx) => {
                  const statusStyles: Record<string, { bg: string; border: string; color: string }> = {
                    pending: { bg: "rgba(255,181,38,0.08)", border: "rgba(255,181,38,0.18)", color: "rgba(255,181,38,0.7)" },
                    scheduled: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", color: "rgba(34,197,94,0.8)" },
                    completed: { bg: "rgba(4,95,133,0.08)", border: "rgba(4,95,133,0.18)", color: "var(--lhr-blue)" },
                    cancelled: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.8)" },
                    no_show: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.8)" },
                  };
                  const s = statusStyles[offer.status] || statusStyles.pending;
                  return (
                    <div
                      key={idx}
                      onClick={() => { setSelectedInterviewOffer(offer); setShowInterviewDetailModal(true); }}
                      className="flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                    >
                      <span className="font-urbanist text-[13px] font-semibold text-white">{offer.system}</span>
                      <span
                        className="px-2 py-0.5 text-[10px] font-semibold rounded-full font-urbanist"
                        style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color }}
                      >
                        {offer.status.replace("_", " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="font-urbanist text-[12px] text-white/20 italic">No interview offers yet</p>
            )}
          </div>

          <div className="mt-4">
            <p className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>Trial Workday Offers</p>
            {selectedApp.trialOffers && selectedApp.trialOffers.length > 0 ? (
              <div className="space-y-2">
                {selectedApp.trialOffers.map((offer, idx) => {
                  const getStatusDisplay = () => {
                    if (offer.accepted === true) return { label: "Accepted", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", color: "rgba(34,197,94,0.8)" };
                    if (offer.accepted === false) return { label: "Declined", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.8)" };
                    return { label: "Pending", bg: "rgba(255,181,38,0.08)", border: "rgba(255,181,38,0.18)", color: "rgba(255,181,38,0.7)" };
                  };
                  const statusDisplay = getStatusDisplay();

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg"
                      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-urbanist text-[13px] font-semibold text-white">{offer.system}</span>
                        <span
                          className="px-2 py-0.5 text-[10px] font-semibold rounded-full font-urbanist"
                          style={{ backgroundColor: statusDisplay.bg, border: `1px solid ${statusDisplay.border}`, color: statusDisplay.color }}
                        >
                          {statusDisplay.label}
                        </span>
                      </div>
                      {offer.accepted === false && offer.rejectionReason && (
                        <p className="font-urbanist text-[11px] text-white/25 mt-1">
                          Reason: {offer.rejectionReason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="font-urbanist text-[12px] text-white/20 italic">No trial offers yet</p>
            )}
          </div>

          {selectedApp.rejectedBySystems && selectedApp.rejectedBySystems.length > 0 && (
            <div className="mt-4">
              <p className="font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>Rejected By</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedApp.rejectedBySystems.map(sys => (
                  <span
                    key={sys}
                    className="px-2 py-0.5 text-[11px] font-semibold rounded-md font-urbanist"
                    style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.7)", border: "1px solid rgba(239,68,68,0.18)" }}
                  >
                    {sys}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-px" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />

        {/* Team Notes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-montserrat text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>Team Notes</h3>
            <span
              className="text-[10px] font-semibold font-urbanist px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(4,95,133,0.1)", color: "var(--lhr-blue)", border: "1px solid rgba(4,95,133,0.2)" }}
            >
              {notes.length}
            </span>
          </div>

          <div className="space-y-2.5 mb-4 max-h-60 overflow-y-auto">
            {notes.map(note => (
              <div
                key={note.id}
                className="rounded-lg p-3 group"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-montserrat text-[11px] font-bold text-white/60">{note.authorName}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-urbanist text-[10px] text-white/15">{format(new Date(note.createdAt), "MMM d, h:mm a")}</span>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 transition-all"
                      style={{ color: "rgba(255,255,255,0.2)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.7)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="font-urbanist text-[13px] text-white/40 leading-relaxed">{note.content}</p>
              </div>
            ))}
            {notes.length === 0 && <p className="font-urbanist text-[12px] text-white/20 italic text-center py-2">No notes yet.</p>}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              disabled={sendingNote}
              className="w-full h-9 rounded-lg pl-3 pr-10 font-urbanist text-[13px] text-white placeholder:text-white/15 focus:outline-none disabled:opacity-50"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            />
            <button
              onClick={handleAddNote}
              disabled={sendingNote}
              className="absolute right-2 top-1/2 -translate-y-1/2 disabled:opacity-50"
              style={{ color: "var(--lhr-blue)" }}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />

        {/* Tasks */}
        <div>
          <h3 className="font-montserrat text-[11px] font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--lhr-gray-blue)" }}>Tasks</h3>
          <div className="space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-2.5 rounded-lg transition-colors group"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <input
                  type="checkbox"
                  checked={task.isCompleted}
                  onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                  className="mt-1 rounded border-neutral-600 bg-neutral-800 text-orange-600 focus:ring-orange-600 focus:ring-offset-neutral-900 cursor-pointer"
                />
                <div className="flex-1">
                  <span className={clsx("font-urbanist text-[13px]", task.isCompleted ? "line-through text-white/20" : "text-white/50")}>
                    {task.description}
                  </span>
                  {task.isCompleted && task.completedBy && (
                    <div className="font-urbanist text-[10px] text-white/10 mt-0.5">Done</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 transition-all"
                  style={{ color: "rgba(255,255,255,0.15)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.7)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {isAddingTask ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Task description..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  className="flex-1 h-8 rounded-lg px-3 font-urbanist text-[12px] text-white placeholder:text-white/15 focus:outline-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  autoFocus
                />
                <button
                  onClick={handleAddTask}
                  className="font-urbanist text-[11px] font-semibold"
                  style={{ color: "var(--lhr-blue)" }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setIsAddingTask(false); setNewTaskDescription(""); }}
                  className="font-urbanist text-[11px] text-white/25"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTask(true)}
                className="flex items-center gap-1.5 font-urbanist text-[11px] font-semibold mt-2 pl-2"
                style={{ color: "var(--lhr-blue)" }}
              >
                <Plus className="h-3 w-3" /> Add Task
              </button>
            )}
          </div>
        </div>

      </aside>

      {/* Modals */}
      {(showInterviewModal || showTrialModal || showRejectModal || showAcceptModal || showEditModal || showInterviewDetailModal || showWaitlistModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">

          {/* Interview Modal */}
          {showInterviewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: teamColor }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-1">Extend Interview Offers</h3>
                  <p className="font-urbanist text-[13px] text-white/30 mb-5">Select which systems to offer interviews for</p>
                  <div className="space-y-2 mb-6">
                    {handleSystemOptions().map((sys: SystemOption) => {
                      const isPreferred = (selectedApp.preferredSystems || []).includes(sys.value as any);
                      const isChecked = selectedInterviewSystems.includes(sys.value);
                      return (
                        <label
                          key={sys.value}
                          className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={isChecked
                            ? { backgroundColor: "rgba(4,95,133,0.1)", border: "1px solid rgba(4,95,133,0.3)" }
                            : { backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }
                          }
                        >
                          <input type="checkbox" checked={isChecked} onChange={(e) => setSelectedInterviewSystems(prev => e.target.checked ? [...prev, sys.value] : prev.filter(s => s !== sys.value))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-orange-600" />
                          <span className="font-urbanist text-[13px] font-semibold text-white">{sys.label}</span>
                          {isPreferred && (
                            <span
                              className="ml-auto text-[10px] font-semibold font-urbanist px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "rgba(4,95,133,0.1)", color: "var(--lhr-blue)", border: "1px solid rgba(4,95,133,0.2)" }}
                            >
                              Interest
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowInterviewModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(ApplicationStatus.INTERVIEW, selectedInterviewSystems)}
                      disabled={statusLoading || selectedInterviewSystems.length === 0}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "var(--lhr-blue)" }}
                    >
                      Extend
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trial Modal */}
          {showTrialModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: teamColor }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-1">Extend Trial Workday Invite</h3>
                  <p className="font-urbanist text-[13px] text-white/30 mb-5">Select a system for the trial invite</p>
                  <div className="space-y-2 mb-6">
                    {handleSystemOptions().map((sys: SystemOption) => {
                      const isSelected = selectedTrialSystems[0] === sys.value;
                      return (
                        <label
                          key={sys.value}
                          className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={isSelected
                            ? { backgroundColor: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)" }
                            : { backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }
                          }
                        >
                          <input type="radio" checked={isSelected} onChange={() => setSelectedTrialSystems([sys.value])} className="w-4 h-4 text-purple-600" />
                          <span className="font-urbanist text-[13px] font-semibold text-white">{sys.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTrialModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(ApplicationStatus.TRIAL, selectedTrialSystems)}
                      disabled={statusLoading || selectedTrialSystems.length === 0}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "rgba(168,85,247,0.8)" }}
                    >
                      Extend Invite
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reject Modal */}
          {showRejectModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: "rgba(239,68,68,0.6)" }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-1">Reject from Systems</h3>
                  <p className="font-urbanist text-[13px] text-white/30 mb-5">Select systems to reject this applicant from</p>
                  <div className="space-y-2 mb-6">
                    {handleSystemOptions().map((sys: SystemOption) => {
                      const isChecked = selectedRejectSystems.includes(sys.value);
                      const isAlreadyRejected = selectedApp.rejectedBySystems?.includes(sys.value);
                      return (
                        <label
                          key={sys.value}
                          className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                          style={{
                            ...(isChecked
                              ? { backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }
                              : { backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }),
                            ...(isAlreadyRejected ? { opacity: 0.5, pointerEvents: "none" as const } : {}),
                          }}
                        >
                          <input type="checkbox" checked={isChecked} onChange={(e) => setSelectedRejectSystems(prev => e.target.checked ? [...prev, sys.value] : prev.filter(s => s !== sys.value))} disabled={isAlreadyRejected} className="w-4 h-4 text-red-600" />
                          <span className="font-urbanist text-[13px] font-semibold text-white">{sys.label}</span>
                          {isAlreadyRejected && <span className="ml-auto font-urbanist text-[10px] font-semibold" style={{ color: "rgba(239,68,68,0.7)" }}>Rejected</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRejectModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRejectSubmit}
                      disabled={statusLoading || selectedRejectSystems.length === 0}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "rgba(239,68,68,0.7)" }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Accept Modal */}
          {showAcceptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: "rgba(34,197,94,0.6)" }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-5">Accept Application</h3>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>System</label>
                      <select
                        value={acceptFormData.system}
                        onChange={(e) => setAcceptFormData({ ...acceptFormData, system: e.target.value })}
                        className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <option value="" disabled style={optionStyle}>Select System</option>
                        {handleSystemOptions().map(s => <option key={s.value} value={s.value} style={optionStyle}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Role</label>
                      <select
                        value={acceptFormData.role}
                        onChange={(e) => setAcceptFormData({ ...acceptFormData, role: e.target.value })}
                        className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <option value="Member" style={optionStyle}>Member</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Details</label>
                      <textarea
                        value={acceptFormData.details}
                        onChange={(e) => setAcceptFormData({ ...acceptFormData, details: e.target.value })}
                        placeholder="Details..."
                        className="w-full rounded-lg px-3 py-2.5 font-urbanist text-[13px] text-white placeholder:text-white/15 focus:outline-none resize-none min-h-[80px]"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowAcceptModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { handleStatusUpdate(ApplicationStatus.ACCEPTED, undefined, acceptFormData); }}
                      disabled={statusLoading || !acceptFormData.system}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "rgba(34,197,94,0.7)" }}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Waitlist Modal */}
          {showWaitlistModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: "rgba(255,181,38,0.6)" }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-1">Waitlist Application</h3>
                  <p className="font-urbanist text-[13px] text-white/30 mb-5">The applicant will be notified that they are on the waitlist when decisions are released.</p>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>System</label>
                      <select
                        value={waitlistFormData.system}
                        onChange={(e) => setWaitlistFormData({ ...waitlistFormData, system: e.target.value })}
                        className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <option value="" disabled style={optionStyle}>Select System</option>
                        {handleSystemOptions().map(s => <option key={s.value} value={s.value} style={optionStyle}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Notes</label>
                      <textarea
                        value={waitlistFormData.details}
                        onChange={(e) => setWaitlistFormData({ ...waitlistFormData, details: e.target.value })}
                        placeholder="Internal notes (optional)..."
                        className="w-full rounded-lg px-3 py-2.5 font-urbanist text-[13px] text-white placeholder:text-white/15 focus:outline-none resize-none min-h-[60px]"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowWaitlistModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { handleStatusUpdate(ApplicationStatus.WAITLISTED, undefined, waitlistFormData); setShowWaitlistModal(false); }}
                      disabled={statusLoading || !waitlistFormData.system}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "rgba(255,181,38,0.6)" }}
                    >
                      Waitlist
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {showEditModal && editFormData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: teamColor }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-5">Edit Application</h3>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Graduation Year</label>
                      <input
                        type="text"
                        value={editFormData.graduationYear}
                        onChange={(e) => setEditFormData({ ...editFormData, graduationYear: e.target.value })}
                        placeholder="Grad Year"
                        className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white placeholder:text-white/15 focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                    <div>
                      <label className="block font-urbanist text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Major</label>
                      <input
                        type="text"
                        value={editFormData.major}
                        onChange={(e) => setEditFormData({ ...editFormData, major: e.target.value })}
                        placeholder="Major"
                        className="w-full h-10 rounded-lg px-3 font-urbanist text-[13px] text-white placeholder:text-white/15 focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowEditModal(false)}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving}
                      className="flex-1 py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ backgroundColor: "var(--lhr-blue)" }}
                    >
                      <Save className="h-3.5 w-3.5" /> {editSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interview Detail Modal */}
          {showInterviewDetailModal && selectedInterviewOffer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="max-w-md w-full mx-4 rounded-2xl overflow-hidden" style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="h-1" style={{ backgroundColor: "var(--lhr-blue)" }} />
                <div className="p-6">
                  <h3 className="font-montserrat text-[18px] font-bold text-white mb-1">Interview Details</h3>
                  <p className="font-urbanist text-[13px] text-white/30 mb-4">{selectedInterviewOffer.system}</p>
                  <p className="font-urbanist text-[13px] text-white/50 mb-5">
                    Status: <span className="text-white font-semibold">{selectedInterviewOffer.status}</span>
                  </p>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => handleUpdateInterviewStatus('completed')}
                      className="flex-1 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white"
                      style={{ backgroundColor: "var(--lhr-blue)" }}
                    >
                      Complete
                    </button>
                    <button
                      onClick={() => handleUpdateInterviewStatus('cancelled')}
                      className="flex-1 py-2 rounded-lg font-urbanist text-[12px] font-semibold text-white"
                      style={{ backgroundColor: "rgba(239,68,68,0.6)" }}
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    onClick={() => setShowInterviewDetailModal(false)}
                    className="w-full py-2.5 rounded-lg font-urbanist text-[13px] font-semibold text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
