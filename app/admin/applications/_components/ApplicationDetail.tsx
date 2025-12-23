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
  Plus
} from "lucide-react";
import clsx from "clsx";
import { ApplicationStatus, InterviewOffer } from "@/lib/models/Application";
import { User, UserRole, Team } from "@/lib/models/User";
import { TEAM_SYSTEMS, TEAM_QUESTIONS, SystemOption, TeamQuestion } from "@/lib/models/teamQuestions";
import { Note, ReviewTask } from "@/lib/models/ApplicationExtras";
import { RecruitingStep } from "@/lib/models/Config";
import { useApplications } from "./ApplicationsContext";
import ApplicationScorecard from "./ApplicationScorecard";

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

  // Related applications state (other teams this user applied to)
  const [relatedApps, setRelatedApps] = useState<Array<{
    id?: string;
    team: string;
    status: string;
    preferredSystems: string[];
  }>>([]);

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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mb-4"></div>
        <p>Loading application...</p>
      </div>
    );
  }

  if (!selectedApp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
         <div className="text-5xl mb-4">🤔</div>
         <p className="text-lg font-medium">Application not found in loaded list.</p>
         <p className="text-sm">Try refreshing the page.</p>
      </div>
    );
  }

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
                          recruitingStep === RecruitingStep.RELEASE_DECISIONS;

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
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-neutral-950">
              {/* Header */}
              <div className="p-8 border-b border-white/5">
                 <div className="flex items-start justify-between">
                    <div className="flex gap-6">
                      <div className="h-20 w-20 rounded-xl bg-neutral-800 flex items-center justify-center text-3xl shrink-0">
                        {selectedApp.user.name ? selectedApp.user.name.charAt(0).toUpperCase() : "👤"}
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold text-white mb-2">{selectedApp.user.name || "Unknown Applicant"}</h1>
                        <div className="text-neutral-400 text-sm mb-4">
                           {selectedApp.formData.major || "Major not specified"} • Class of {selectedApp.formData.graduationYear || "N/A"}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 text-xs font-medium border border-orange-500/20">
                            {selectedApp.team} Team
                          </span>
                           {(selectedApp.preferredSystems?.length ?? 0) > 0 && selectedApp.preferredSystems!.map(sys => (
                             <span key={sys} className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                               {sys}
                             </span>
                           ))}
                        </div>

                        {/* Also Applied To - inline in header */}
                        {relatedApps.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap mt-3">
                            <span className="text-xs text-neutral-500">Also applied to:</span>
                            {relatedApps.map((app, idx) => {
                              const isAdmin = currentUser?.role === UserRole.ADMIN;
                              const statusColor = app.status === 'rejected' 
                                ? 'text-red-400' 
                                : app.status === 'accepted' 
                                  ? 'text-green-400' 
                                  : 'text-neutral-300';
                              
                              const badge = (
                                <span 
                                  className={clsx(
                                    "px-2 py-1 rounded text-xs font-medium border",
                                    "bg-purple-500/10 text-purple-400 border-purple-500/20",
                                    isAdmin && app.id && "cursor-pointer hover:bg-purple-500/20 transition-colors"
                                  )}
                                >
                                  {app.team} <span className={statusColor}>({getStatusLabel(app.status)})</span>
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
                    <div className="flex items-center gap-4">
                      <a 
                        href={`mailto:${selectedApp.user.email}`}
                        className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm"
                      >
                        <Mail className="h-4 w-4" />
                        {selectedApp.user.email}
                      </a>
                      
                      {currentUser?.role === UserRole.ADMIN && (
                        <button 
                          onClick={() => handleOpenEditModal()}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-neutral-800 text-white text-sm font-medium border border-white/10 hover:bg-neutral-700 transition-colors"
                        >
                          <Edit className="h-4 w-4" /> Edit
                        </button>
                      )}
                    </div>
                 </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/5 px-8">
                 {["application", "resume", "scorecard"].map((tab) => (
                   <button
                     key={tab}
                     onClick={() => setActiveTab(tab as any)}
                     className={clsx(
                       "px-6 py-4 text-sm font-medium border-b-2 transition-colors",
                       activeTab === tab 
                         ? "border-orange-500 text-orange-500" 
                         : "border-transparent text-neutral-400 hover:text-white"
                     )}
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
                        <h3 className="text-lg font-bold text-white mb-4">Why do you want to join Longhorn Racing?</h3>
                        <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                          {selectedApp.formData.whyJoin || "No answer provided."}
                        </p>
                      </div>
                      <div className="h-px bg-white/5" />
                      <div>
                        <h3 className="text-lg font-bold text-white mb-4">Describe a technical problem you solved recently.</h3>
                        <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                          {selectedApp.formData.relevantExperience || "No answer provided."}
                        </p>
                      </div>
                      
                      {selectedApp.formData.teamQuestions && Object.entries(selectedApp.formData.teamQuestions).map(([qId, answer]) => {
                        const teamQuestions: TeamQuestion[] = TEAM_QUESTIONS[selectedApp.team as Team] || [];
                        const question = teamQuestions.find((q: TeamQuestion) => q.id === qId);
                        return (
                          <div key={qId}>
                            <div className="h-px bg-white/5 my-8" />
                            <h3 className="text-lg font-bold text-white mb-4">{question?.label || qId}</h3>
                            <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">{answer as string}</p>
                          </div>
                        );
                      })}
                   </div>
                )}
                
                <div className={clsx("flex flex-col h-full min-h-[600px]", activeTab !== "resume" && "hidden")}>
                    {selectedApp.formData.resumeUrl ? (
                      <>
                        <div className="flex justify-between items-center bg-neutral-900 border border-white/5 rounded-t-lg px-4 py-3">
                           <span className="text-sm font-medium text-neutral-400">Resume Preview</span>
                           <a 
                             href={selectedApp.formData.resumeUrl} 
                             target="_blank" 
                             rel="noreferrer"
                             className="flex items-center gap-2 text-xs font-medium text-orange-500 hover:text-orange-400 transition-colors"
                           >
                               Open in New Tab <ExternalLink className="h-3 w-3" />
                           </a>
                        </div>
                        <iframe 
                          src={selectedApp.formData.resumeUrl} 
                          className="w-full flex-1 bg-white border-x border-b border-white/5 rounded-b-lg h-[calc(100vh-350px)]" 
                          title="Resume"
                        />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/50">
                         <FileText className="h-16 w-16 text-neutral-500 mb-4 mx-auto" />
                         <div className="text-neutral-500">No resume uploaded.</div>
                      </div>
                    )}
                  </div>

                {activeTab === "scorecard" && (
                    <ApplicationScorecard 
                        applicationId={applicationId}
                        currentUserSystem={currentUser?.memberProfile?.system}
                        isPrivilegedUser={currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.TEAM_CAPTAIN_OB}
                    />
                )}
              </div>
            </div>

            {/* Right Sidebar */}
             <aside className="w-80 flex-shrink-0 border-l border-white/5 bg-neutral-900/30 overflow-y-auto p-6 space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white">Current Status</h3>
                    <Clock className="h-4 w-4 text-neutral-500" />
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
                        <div className="flex justify-between items-center text-xs font-medium text-neutral-500 mb-2">
                          <span className={clsx(currentIndex >= 0 && "text-orange-500")}>Applied</span>
                          <span className={clsx(currentIndex >= 1 && "text-orange-500")}>Review</span>
                          <span className={clsx(currentIndex >= 2 && "text-orange-500")}>Interview</span>
                          <span className={clsx(currentIndex >= 4 && "text-green-400")}>Offer</span>
                        </div>
                        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-6">
                          <div 
                            className={clsx(
                              "h-full rounded-full transition-all",
                              isRejected ? "bg-red-500" : currentIndex >= 4 ? "bg-green-500" : "bg-orange-500"
                            )}
                            style={{ width: isRejected ? '100%' : `${progressPercent}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}

                  <div className={clsx(
                    "rounded-lg p-3 text-sm font-medium flex justify-between items-center mb-4",
                    selectedApp.status === ApplicationStatus.REJECTED 
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : selectedApp.status === ApplicationStatus.ACCEPTED
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-neutral-800 text-white"
                  )}>
                     <span>{getStatusLabel(selectedApp.status)}</span>
                  </div>

                  {/* Only show Advance/Reject buttons for non-reviewers */}
                  {currentUser?.role !== UserRole.REVIEWER && (
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        disabled={statusLoading}
                        onClick={handleRejectClick}
                        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 transition-colors border border-white/5 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                      <button
                        disabled={statusLoading}
                        onClick={handleAdvanceClick}
                        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-500 transition-colors shadow-lg shadow-orange-900/20 disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" /> Advance
                      </button>
                    </div>
                  )}
                </div>

                <div className="h-px bg-white/5" />

                 <div>
                   <h3 className="font-bold text-white mb-4">System Status</h3>
                   <div className="mb-4">
                     <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Applicant Interests</p>
                     <div className="flex flex-wrap gap-2">
                       {(selectedApp.preferredSystems || []).length > 0 ? (
                         (selectedApp.preferredSystems || []).map(sys => (
                           <span 
                             key={sys} 
                             className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full"
                           >
                             {sys}
                           </span>
                         ))
                       ) : (
                         <span className="text-neutral-500 text-sm italic">None specified</span>
                       )}
                     </div>
                   </div>

                   <div>
                     <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Interview Offers</p>
                     {selectedApp.interviewOffers && selectedApp.interviewOffers.length > 0 ? (
                       <div className="space-y-2">
                         {selectedApp.interviewOffers.map((offer, idx) => (
                           <div 
                             key={idx} 
                             onClick={() => { setSelectedInterviewOffer(offer); setShowInterviewDetailModal(true); }}
                             className="flex items-center justify-between p-2 bg-neutral-800/50 rounded-lg border border-white/5 cursor-pointer hover:bg-neutral-700/50 hover:border-white/10 transition-colors"
                           >
                             <span className="text-sm text-white font-medium">{offer.system}</span>
                             <span className={clsx(
                               "px-2 py-0.5 text-xs rounded-full",
                               offer.status === "pending" && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                               offer.status === "scheduled" && "bg-green-500/10 text-green-400 border border-green-500/20",
                               offer.status === "completed" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                               offer.status === "cancelled" && "bg-red-500/10 text-red-400 border border-red-500/20",
                               offer.status === "no_show" && "bg-red-500/10 text-red-400 border border-red-500/20"
                             )}>
                               {offer.status.replace("_", " ")}
                             </span>
                           </div>
                         ))}
                       </div>
                     ) : (
                       <p className="text-neutral-500 text-sm italic">No interview offers yet</p>
                     )}
                   </div>

                   <div className="mt-4">
                     <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Trial Workday Offers</p>
                     {selectedApp.trialOffers && selectedApp.trialOffers.length > 0 ? (
                       <div className="space-y-2">
                         {selectedApp.trialOffers.map((offer, idx) => {
                           const getStatusDisplay = () => {
                             if (offer.accepted === true) return { label: "Accepted", style: "bg-green-500/10 text-green-400 border border-green-500/20" };
                             if (offer.accepted === false) return { label: "Declined", style: "bg-red-500/10 text-red-400 border border-red-500/20" };
                             return { label: "Pending", style: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" };
                           };
                           const statusDisplay = getStatusDisplay();
                           
                           return (
                             <div 
                               key={idx} 
                               className="p-2 bg-neutral-800/50 rounded-lg border border-white/5"
                             >
                               <div className="flex items-center justify-between">
                                 <span className="text-sm text-white font-medium">{offer.system}</span>
                                 <span className={clsx("px-2 py-0.5 text-xs rounded-full", statusDisplay.style)}>
                                   {statusDisplay.label}
                                 </span>
                               </div>
                               {offer.accepted === false && offer.rejectionReason && (
                                 <p className="text-xs text-neutral-400 mt-1">
                                   Reason: {offer.rejectionReason}
                                 </p>
                               )}
                             </div>
                           );
                         })}
                       </div>
                     ) : (
                       <p className="text-neutral-500 text-sm italic">No trial offers yet</p>
                     )}
                   </div>

                   {selectedApp.rejectedBySystems && selectedApp.rejectedBySystems.length > 0 && (
                     <div className="mt-4">
                       <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Rejected By</p>
                       <div className="flex flex-wrap gap-2">
                         {selectedApp.rejectedBySystems.map(sys => (
                           <span 
                             key={sys} 
                             className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-full"
                           >
                             {sys}
                           </span>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>

                 <div className="h-px bg-white/5" />
                 
                <div>
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="font-bold text-white">Team Notes</h3>
                     <span className="bg-orange-500/20 text-orange-500 text-xs px-2 py-0.5 rounded-full">{notes.length}</span>
                   </div>
                   
                   <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                     {notes.map(note => (
                         <div key={note.id} className="bg-neutral-800/50 rounded-lg p-3 text-sm group">
                             <div className="flex justify-between items-center mb-1">
                                 <span className="font-bold text-white text-xs">{note.authorName}</span>
                                 <div className="flex items-center gap-2">
                                   <span className="text-neutral-500 text-[10px]">{format(new Date(note.createdAt), "MMM d, h:mm a")}</span>
                                   <button
                                     onClick={() => handleDeleteNote(note.id)}
                                     className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
                                   >
                                     <Trash2 className="h-3 w-3" />
                                   </button>
                                 </div>
                             </div>
                             <p className="text-neutral-300 leading-relaxed">{note.content}</p>
                         </div>
                     ))}
                     {notes.length === 0 && <p className="text-neutral-500 text-sm italic text-center">No notes yet.</p>}
                   </div>

                   <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Add a note..." 
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                        disabled={sendingNote}
                        className="w-full bg-neutral-900 border border-white/10 rounded-md py-2 pl-3 pr-10 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
                      />
                      <button 
                        onClick={handleAddNote}
                        disabled={sendingNote}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-400 disabled:opacity-50"
                      >
                         <MessageSquare className="h-4 w-4" />
                      </button>
                   </div>
                </div>

                <div className="h-px bg-white/5" />
                
                <div>
                   <h3 className="font-bold text-white mb-4">Tasks</h3>
                   <div className="space-y-3">
                     {tasks.map(task => (
                         <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors group">
                            <input 
                              type="checkbox" 
                              checked={task.isCompleted}
                              onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                              className="mt-1 rounded border-neutral-600 bg-neutral-800 text-orange-600 focus:ring-orange-600 focus:ring-offset-neutral-900 cursor-pointer" 
                            />
                            <div className="flex-1 text-sm">
                                <span className={clsx("text-neutral-300", task.isCompleted && "line-through text-neutral-500")}>
                                    {task.description}
                                </span>
                                {task.isCompleted && task.completedBy && (
                                    <div className="text-xs text-neutral-600 mt-1">Done</div>
                                )}
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
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
                            className="flex-1 bg-neutral-900 border border-white/10 rounded-md py-1.5 px-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50"
                            autoFocus
                          />
                          <button
                            onClick={handleAddTask}
                            className="text-orange-500 hover:text-orange-400 text-xs font-medium"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => { setIsAddingTask(false); setNewTaskDescription(""); }}
                            className="text-neutral-500 hover:text-white text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setIsAddingTask(true)}
                          className="flex items-center gap-2 text-orange-500 text-xs font-medium mt-2 hover:text-orange-400 pl-2"
                        >
                           <Plus className="h-3 w-3" /> Add Task
                        </button>
                      )}
                   </div>
                </div>

             </aside>
             
             {/* Modals */}
             {(showInterviewModal || showTrialModal || showRejectModal || showAcceptModal || showEditModal || showInterviewDetailModal) && (
               <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                 {/* This is a wrapper for all modals. Since modals are absolute/fixed, they will render on top. 
                     However, simpler to just inline them or put them in body. 
                     For simplicity in this refactor, I will just render them assuming they use fixed positioning properly.
                 */}
                 
                 {/* Interview Modal */}
                 {showInterviewModal && (
                   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                     <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                       <h3 className="text-xl font-bold text-white mb-2">Extend Interview Offers</h3>
                       <div className="space-y-2 mb-6">
                          {handleSystemOptions().map((sys: SystemOption) => {
                            const isPreferred = (selectedApp.preferredSystems || []).includes(sys.value as any);
                            const isChecked = selectedInterviewSystems.includes(sys.value);
                            return (
                               <label key={sys.value} className={clsx("flex items-center gap-3 p-3 rounded-lg border cursor-pointer", isChecked ? "bg-orange-500/10 border-orange-500/50" : "bg-neutral-800 border-white/10")}>
                                 <input type="checkbox" checked={isChecked} onChange={(e) => setSelectedInterviewSystems(prev => e.target.checked ? [...prev, sys.value] : prev.filter(s => s !== sys.value))} className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-orange-600" />
                                 <span className="text-white font-medium">{sys.label}</span>
                                 {isPreferred && <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Interest</span>}
                               </label>
                            );
                          })}
                       </div>
                       <div className="flex gap-3">
                         <button onClick={() => setShowInterviewModal(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium border border-white/10">Cancel</button>
                         <button onClick={() => handleStatusUpdate(ApplicationStatus.INTERVIEW, selectedInterviewSystems)} disabled={statusLoading || selectedInterviewSystems.length === 0} className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-medium">Extend</button>
                       </div>
                     </div>
                   </div>
                 )}

                 {/* Trial Modal - Simplified for brevity */}
                 {showTrialModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                          <h3 className="text-xl font-bold text-white mb-2">Extend Trial Workday Invite</h3>
                          <div className="space-y-2 mb-6">
                            {handleSystemOptions().map((sys: SystemOption) => {
                                const isSelected = selectedTrialSystems[0] === sys.value;
                                return (
                                  <label key={sys.value} className={clsx("flex items-center gap-3 p-3 rounded-lg border cursor-pointer", isSelected ? "bg-purple-500/10 border-purple-500/50" : "bg-neutral-800 border-white/10")}>
                                     <input type="radio" checked={isSelected} onChange={() => setSelectedTrialSystems([sys.value])} className="w-4 h-4 text-purple-600" />
                                     <span className="text-white font-medium">{sys.label}</span>
                                  </label>
                                );
                            })}
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowTrialModal(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium border border-white/10">Cancel</button>
                            <button onClick={() => handleStatusUpdate(ApplicationStatus.TRIAL, selectedTrialSystems)} disabled={statusLoading || selectedTrialSystems.length === 0} className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-medium">Extend Invite</button>
                          </div>
                      </div>
                    </div>
                 )}

                 {/* Reject Modal */}
                 {showRejectModal && (
                     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                        <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                           <h3 className="text-xl font-bold text-white mb-2">Reject from Systems</h3>
                           <div className="space-y-2 mb-6">
                             {handleSystemOptions().map((sys: SystemOption) => {
                               const isChecked = selectedRejectSystems.includes(sys.value);
                               const isAlreadyRejected = selectedApp.rejectedBySystems?.includes(sys.value);
                               return (
                                 <label key={sys.value} className={clsx("flex items-center gap-3 p-3 rounded-lg border cursor-pointer", isChecked ? "bg-red-500/10 border-red-500/50" : "bg-neutral-800 border-white/10", isAlreadyRejected && "opacity-50 pointer-events-none")}>
                                    <input type="checkbox" checked={isChecked} onChange={(e) => setSelectedRejectSystems(prev => e.target.checked ? [...prev, sys.value] : prev.filter(s => s !== sys.value))} disabled={isAlreadyRejected} className="w-4 h-4 text-red-600" />
                                    <span className="text-white font-medium">{sys.label}</span>
                                    {isAlreadyRejected && <span className="ml-auto text-xs text-red-400">Rejected</span>}
                                 </label>
                               );
                             })}
                           </div>
                           <div className="flex gap-3">
                             <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium border border-white/10">Cancel</button>
                             <button onClick={handleRejectSubmit} disabled={statusLoading || selectedRejectSystems.length === 0} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium">Reject</button>
                           </div>
                        </div>
                     </div>
                 )}
                 
                 {/* Accept Modal */}
                 {showAcceptModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                       <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                          <h3 className="text-xl font-bold text-white mb-6">Accept Application</h3>
                          <div className="space-y-4 mb-6">
                            <select value={acceptFormData.system} onChange={(e) => setAcceptFormData({ ...acceptFormData, system: e.target.value })} className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white">
                               <option value="" disabled>Select System</option>
                               {handleSystemOptions().map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select value={acceptFormData.role} onChange={(e) => setAcceptFormData({ ...acceptFormData, role: e.target.value })} className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white">
                               <option value="Member">Member</option>
                               <option value="Lead">Lead</option>
                            </select>
                            <textarea value={acceptFormData.details} onChange={(e) => setAcceptFormData({ ...acceptFormData, details: e.target.value })} placeholder="Details..." className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white min-h-[100px]" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowAcceptModal(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium border border-white/10">Cancel</button>
                            <button onClick={() => { handleStatusUpdate(ApplicationStatus.ACCEPTED, undefined, acceptFormData); }} disabled={statusLoading || !acceptFormData.system} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium">Accept</button>
                          </div>
                       </div>
                    </div>
                 )}

                 {/* Edit Modal */}
                 {showEditModal && editFormData && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                       <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                          <h3 className="text-xl font-bold text-white mb-6">Edit Application</h3>
                          {/* Form fields simplified */}
                          <div className="space-y-4 mb-6">
                            <input type="text" value={editFormData.graduationYear} onChange={(e) => setEditFormData({...editFormData, graduationYear: e.target.value})} placeholder="Grad Year" className="w-full bg-neutral-800 border-white/10 border rounded-lg px-4 py-2 text-white" />
                            <input type="text" value={editFormData.major} onChange={(e) => setEditFormData({...editFormData, major: e.target.value})} placeholder="Major" className="w-full bg-neutral-800 border-white/10 border rounded-lg px-4 py-2 text-white" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium border border-white/10">Cancel</button>
                            <button onClick={handleSaveEdit} disabled={editSaving} className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-medium">Save</button>
                          </div>
                       </div>
                    </div>
                 )}
                 
                 {/* Interview Detail Modal */}
                 {showInterviewDetailModal && selectedInterviewOffer && (
                   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
                      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                         <h3 className="text-xl font-bold text-white mb-2">Interview Details</h3>
                         <p className="text-neutral-400 mb-4">{selectedInterviewOffer.system}</p>
                         <p className="text-white text-sm mb-4">Status: {selectedInterviewOffer.status}</p>
                         <div className="flex gap-2 mb-4">
                           <button onClick={() => handleUpdateInterviewStatus('completed')} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm">Complete</button>
                           <button onClick={() => handleUpdateInterviewStatus('cancelled')} className="flex-1 py-2 bg-red-600 text-white rounded text-sm">Cancel</button>
                         </div>
                         <button onClick={() => setShowInterviewDetailModal(false)} className="w-full py-2 bg-neutral-800 text-white border border-white/10 rounded text-sm">Close</button>
                      </div>
                   </div>
                 )}

               </div>
             )}
      </div>
  );
}
