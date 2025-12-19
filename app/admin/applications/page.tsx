"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Application, ApplicationStatus } from "@/lib/models/Application";
import { Team, User, UserRole } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { TEAM_INFO, TEAM_QUESTIONS } from "@/lib/models/teamQuestions";
import { Note, ReviewTask } from "@/lib/models/ApplicationExtras";
import { ScorecardConfig, ScorecardSubmission } from "@/lib/models/Scorecard";
import { format } from "date-fns";
import { 
  Search, 
  Mail, 
  Edit, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText,
  MessageSquare,
  Plus,
  ExternalLink,
  Trash2
} from "lucide-react";
import clsx from "clsx";

interface ApplicationWithUser extends Application {
  user: User;
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles = {
    [ApplicationStatus.IN_PROGRESS]: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    [ApplicationStatus.SUBMITTED]: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    [ApplicationStatus.UNDER_REVIEW]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    [ApplicationStatus.INTERVIEW]: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    [ApplicationStatus.ACCEPTED]: "bg-green-500/10 text-green-400 border-green-500/20",
    [ApplicationStatus.REJECTED]: "bg-red-500/10 text-red-500 border-red-500/20",
    [ApplicationStatus.TRIAL]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  return (
    <span className={clsx("px-2.5 py-0.5 text-xs font-medium rounded-full border", styles[status])}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"application" | "resume" | "scorecard">("application");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState<ApplicationStatus[]>([]);
  const [systemFilters, setSystemFilters] = useState<string[]>([]);
  const [teamFilters, setTeamFilters] = useState<string[]>([]);

  // Extras State
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [newNote, setNewNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Current user state (for role-based behavior)
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Interview offer modal state
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [selectedInterviewSystems, setSelectedInterviewSystems] = useState<string[]>([]);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRejectSystems, setSelectedRejectSystems] = useState<string[]>([]);

  // Scorecard State
  const [scorecardConfig, setScorecardConfig] = useState<ScorecardConfig | null>(null);
  const [scorecardData, setScorecardData] = useState<Record<string, any>>({});
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [scorecardSaving, setScorecardSaving] = useState(false);
  
  // Multi-system scorecard state
  const [selectedScorecardSystem, setSelectedScorecardSystem] = useState<string | null>(null);
  const [allTeamSystems, setAllTeamSystems] = useState<string[]>([]);
  const [systemsWithConfigs, setSystemsWithConfigs] = useState<string[]>([]);
  const [isPrivilegedUser, setIsPrivilegedUser] = useState(false);
  
  // Aggregate scorecard state
  const [scorecardAggregates, setScorecardAggregates] = useState<any>(null);
  const [allScorecardSubmissions, setAllScorecardSubmissions] = useState<ScorecardSubmission[]>([]);

  useEffect(() => {
    async function fetchApps() {
      try {
        const res = await fetch("/api/admin/applications");
        if (res.ok) {
          const data = await res.json();
          setApplications(data.applications || []);
          if (data.applications?.length > 0) {
            setSelectedAppId(data.applications[0].id);
          }
        }
        // Fetch current user
        const userRes = await fetch("/api/auth/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setCurrentUser(userData.user);
        }
      } catch (err) {
        console.error("Failed to fetch applications", err);
      } finally {
        setLoading(false);
      }
    }
    fetchApps();
  }, []);

  const selectedApp = applications.find(app => app.id === selectedAppId);

  // Fetch extras when selected app changes
  useEffect(() => {
    if (!selectedAppId) return;

    // Fetch Notes and Tasks
    fetch(`/api/admin/applications/${selectedAppId}/notes`)
      .then(res => res.json())
      .then(data => setNotes(data.notes || []));

    fetch(`/api/admin/applications/${selectedAppId}/tasks`)
      .then(res => res.json())
      .then(data => setTasks(data.tasks || []));

    // Reset scorecard state
    setScorecardConfig(null);
    setScorecardData({});
    setSelectedScorecardSystem(null);
    setAllTeamSystems([]);
    setSystemsWithConfigs([]);
  }, [selectedAppId]);

  // Fetch Scorecard Config - only when not already loaded for this app/system
  useEffect(() => {
    // Only fetch if we don't have a config yet, or if system changed
    const shouldFetch = activeTab === "scorecard" && 
                        selectedAppId && 
                        !scorecardConfig;
    
    if (shouldFetch) {
        setScorecardLoading(true);
        const systemParam = selectedScorecardSystem ? `?system=${encodeURIComponent(selectedScorecardSystem)}` : '';
        fetch(`/api/admin/applications/${selectedAppId}/scorecard${systemParam}`)
            .then(res => res.json())
            .then(data => {
                setScorecardConfig(data.config);
                if (data.submission) {
                    setScorecardData(data.submission.data);
                } else {
                    setScorecardData({});
                }
                // Set available systems data
                if (data.allTeamSystems) {
                    setAllTeamSystems(data.allTeamSystems);
                }
                if (data.systemsWithConfigs) {
                    setSystemsWithConfigs(data.systemsWithConfigs);
                }
                if (data.currentSystem && !selectedScorecardSystem) {
                    setSelectedScorecardSystem(data.currentSystem);
                }
                setIsPrivilegedUser(data.isPrivileged || false);
                
                // Set aggregate data
                setScorecardAggregates(data.aggregates);
                setAllScorecardSubmissions(data.allSubmissions || []);
            })
            .finally(() => setScorecardLoading(false));
    }
  }, [activeTab, selectedAppId, scorecardConfig, selectedScorecardSystem]);

  // Handle system change - refetch when system is explicitly changed
  const handleSystemChange = (newSystem: string) => {
    setSelectedScorecardSystem(newSystem);
    setScorecardData({}); // Reset data when switching
    setScorecardConfig(null); // Clear config to trigger refetch
  };


  const handleStatusUpdate = async (status: ApplicationStatus, systems?: string[]) => {
    if (!selectedAppId) return;
    setStatusLoading(true);
    try {
        const res = await fetch(`/api/admin/applications/${selectedAppId}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, systems }),
        });
        const data = await res.json();
        
        if (res.ok && data.application) {
            // Update local state with the full application data (includes interview offers)
            setApplications(prev => prev.map(a => 
              a.id === selectedAppId 
                ? { ...a, ...data.application, user: a.user } 
                : a
            ));
            toast.success(`Status updated to ${status.replace("_", " ")}`);
            setShowInterviewModal(false);
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

  // Handle Advance button click - show modal for higher roles, auto-advance for reviewers
  const handleAdvanceClick = () => {
    if (!selectedApp) return;
    
    // For Reviewers, auto-use their system
    if (currentUser?.role === UserRole.REVIEWER) {
      handleStatusUpdate(ApplicationStatus.INTERVIEW);
      return;
    }
    
    // For higher roles, show modal to select systems
    // Pre-select systems that already have interview offers
    const existingOfferSystems = selectedApp.interviewOffers?.map(o => o.system) || [];
    setSelectedInterviewSystems(existingOfferSystems);
    setShowInterviewModal(true);
  };

  // Get available systems for the selected application's team
  const getTeamSystemOptions = () => {
    if (!selectedApp) return [];
    return TEAM_SYSTEMS[selectedApp.team as Team] || [];
  };

  // Handle Reject button click - show modal for selecting systems to reject
  const handleRejectClick = () => {
    if (!selectedApp) return;
    
    const isHigherAuthority = currentUser?.role === UserRole.ADMIN || 
                               currentUser?.role === UserRole.TEAM_CAPTAIN_OB;
    
    // Get all systems with active interview offers
    const existingOfferSystems = selectedApp.interviewOffers?.map(o => o.system) || [];
    
    if (isHigherAuthority) {
      // Admin/Team Captain: pre-select all systems with offers
      setSelectedRejectSystems(existingOfferSystems);
    } else {
      // System Lead/Reviewer: only pre-select their own system if it has an offer
      const userSystem = currentUser?.memberProfile?.system;
      if (userSystem && existingOfferSystems.includes(userSystem)) {
        setSelectedRejectSystems([userSystem]);
      } else {
        setSelectedRejectSystems([]);
      }
    }
    
    setShowRejectModal(true);
  };

  // Handle rejection submission
  const handleRejectSubmit = async () => {
    if (!selectedAppId || selectedRejectSystems.length === 0) return;
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${selectedAppId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systems: selectedRejectSystems }),
      });
      const data = await res.json();
      
      if (res.ok && data.application) {
        setApplications(prev => prev.map(a => 
          a.id === selectedAppId 
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

  const handleAddNote = async () => {
    if (!selectedAppId || !newNote.trim()) return;
    setSendingNote(true);
    try {
        const res = await fetch(`/api/admin/applications/${selectedAppId}/notes`, {
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

  const handleAddTask = async () => {
     if (!selectedAppId || !newTaskDescription.trim()) return;
     setIsAddingTask(false);

     const res = await fetch(`/api/admin/applications/${selectedAppId}/tasks`, {
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
    if (!selectedAppId) return;
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isCompleted, completedAt: isCompleted ? new Date() : undefined } : t));
    
    await fetch(`/api/admin/applications/${selectedAppId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted }),
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedAppId) return;
    // Optimistic update
    setNotes(prev => prev.filter(n => n.id !== noteId));
    
    await fetch(`/api/admin/applications/${selectedAppId}/notes/${noteId}`, {
        method: "DELETE",
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedAppId) return;
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));
    
    await fetch(`/api/admin/applications/${selectedAppId}/tasks/${taskId}`, {
        method: "DELETE",
    });
  };

  const handleScorecardSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedAppId) return;
      setScorecardSaving(true);
      try {
          await fetch(`/api/admin/applications/${selectedAppId}/scorecard`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                  data: scorecardData,
                  system: selectedScorecardSystem 
              }),
          });
          toast.success("Scorecard saved!");
      } finally {
          setScorecardSaving(false);
      }
  };

  const filteredApplications = applications.filter(app => {
    const matchesName = app.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(app.status);
    const appSystems = app.preferredSystems || (app.preferredSystem ? [app.preferredSystem] : []);
    const matchesSystem = systemFilters.length === 0 || appSystems.some(s => systemFilters.includes(s));
    const matchesTeam = teamFilters.length === 0 || teamFilters.includes(app.team);
    return matchesName && matchesStatus && matchesSystem && matchesTeam;
  });


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getTeamInfo = (teamName: string) => TEAM_INFO.find(t => t.team === teamName);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500 h-full">
        <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mr-3"></div>
        Loading applications...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-neutral-950 overflow-hidden">
      {/* Left Sidebar: Applicant List */}
      <aside className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col bg-neutral-900/30">
        <div className="p-4 border-b border-white/5">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium text-neutral-400">Applicants</div>
            <div className="text-xs text-neutral-500">
              {filteredApplications.length === applications.length 
                ? applications.length 
                : `${filteredApplications.length} / ${applications.length}`}
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Filter by name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-white/10 rounded-md py-2 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-neutral-500 mb-1">Team</div>
            <div className="flex flex-wrap gap-1">
              {[...new Set(applications.map(a => a.team))].map(team => (
                <button
                  key={team}
                  onClick={() => setTeamFilters(prev => 
                    prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
                  )}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    teamFilters.includes(team)
                      ? 'bg-green-500/20 border-green-500/50 text-green-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500 mb-1 mt-3">Status</div>
            <div className="flex flex-wrap gap-1">
              {Object.values(ApplicationStatus).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilters(prev => 
                    prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                  )}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    statusFilters.includes(status)
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  {status.replace("_", " ").toUpperCase()}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500 mb-1 mt-3">System</div>
            <div className="flex flex-wrap gap-1">
              {[...new Set(applications.map(a => a.preferredSystem).filter(Boolean))].map(system => (
                <button
                  key={system}
                  onClick={() => setSystemFilters(prev => 
                    prev.includes(system!) ? prev.filter(s => s !== system) : [...prev, system!]
                  )}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    systemFilters.includes(system!)
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  {system}
                </button>
              ))}
            </div>
            {(statusFilters.length > 0 || systemFilters.length > 0 || teamFilters.length > 0) && (
              <button
                onClick={() => { setStatusFilters([]); setSystemFilters([]); setTeamFilters([]); }}
                className="mt-2 text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
           {filteredApplications.map(app => (
             <div 
               key={app.id}
               onClick={() => setSelectedAppId(app.id)}
               className={clsx(
                 "p-4 border-b border-white/5 cursor-pointer hover:bg-neutral-800/50 transition-colors",
                 selectedAppId === app.id ? "bg-orange-500/5 border-l-2 border-l-orange-500" : "border-l-2 border-l-transparent"
               )}
             >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={clsx("font-medium text-sm truncate pr-2", selectedAppId === app.id ? "text-white" : "text-neutral-300")}>
                    {app.user.name || "Unknown Applicant"}
                  </h3>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">{format(new Date(app.createdAt), "MMM d")}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
                  <span className={clsx(app.team === "Electric" && "text-yellow-500", app.team === "Solar" && "text-blue-500", app.team === "Combustion" && "text-red-500")}>
                    {app.team}
                  </span>
                  <span>•</span>
                  <span>{app.preferredSystem || "General"}</span>
                </div>
                <StatusBadge status={app.status} />
             </div>
           ))}
           {filteredApplications.length === 0 && (
             <div className="p-8 text-center text-neutral-500 text-sm">
               {searchTerm ? "No matches found." : "No applications found."}
             </div>
           )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {selectedApp ? (
          <>
            {/* Center Panel */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-neutral-950">
              {/* Header */}
              <div className="p-8 border-b border-white/5">
                 <div className="flex items-start justify-between">
                    <div className="flex gap-6">
                      {/* Avatar Placeholder */}
                      <div className="h-20 w-20 rounded-xl bg-neutral-800 flex items-center justify-center text-3xl shrink-0">
                        {selectedApp.user.name ? selectedApp.user.name.charAt(0).toUpperCase() : "👤"}
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold text-white mb-2">{selectedApp.user.name || "Unknown Applicant"}</h1>
                        <div className="text-neutral-400 text-sm mb-4">
                           {selectedApp.formData.major || "Major not specified"} • Class of {selectedApp.formData.graduationYear || "N/A"}
                        </div>
                        <div className="flex gap-2">
                          <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 text-xs font-medium border border-orange-500/20">
                            {selectedApp.team} Team
                          </span>
                           {selectedApp.preferredSystem && (
                             <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                               {selectedApp.preferredSystem}
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors">
                        <Mail className="h-4 w-4" /> Email
                      </button>
                      <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-neutral-800 text-white text-sm font-medium border border-white/10 hover:bg-neutral-700 transition-colors">
                        <Edit className="h-4 w-4" /> Edit
                      </button>
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
                      
                      {/* Team Specific Questions */}
                      {selectedApp.formData.teamQuestions && Object.entries(selectedApp.formData.teamQuestions).map(([qId, answer]) => {
                        const teamQuestions = TEAM_QUESTIONS[selectedApp.team as Team] || [];
                        const question = teamQuestions.find(q => q.id === qId);
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
                
                {activeTab === "resume" && (
                  <div className="flex flex-col h-full min-h-[600px]">
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
                )}

                {activeTab === "scorecard" && (
                   scorecardLoading ? <div className="text-neutral-500">Loading scorecard...</div> :
                   !scorecardConfig ? <div className="text-neutral-500">No scorecard configuration found for this team.</div> :
                   (
                       <div className="max-w-2xl space-y-6">
                           {/* System Selector for Privileged Users */}
                           {isPrivilegedUser && allTeamSystems.length > 1 && (
                               <div className="p-4 rounded-lg bg-neutral-900/50 border border-white/5">
                                   <label className="block text-sm font-medium text-neutral-400 mb-2">
                                       Select System Scorecard
                                   </label>
                                   <div className="flex flex-wrap gap-2">
                                       {allTeamSystems.map(sys => {
                                           const hasConfig = systemsWithConfigs.includes(sys);
                                           const isSelected = selectedScorecardSystem === sys;
                                           return (
                                               <button
                                                   key={sys}
                                                   type="button"
                                                   onClick={() => handleSystemChange(sys)}
                                                   className={clsx(
                                                       "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                                                       isSelected
                                                           ? "bg-orange-500/20 border-orange-500 text-orange-400"
                                                           : hasConfig
                                                               ? "bg-neutral-800 border-white/10 text-white hover:border-white/20"
                                                               : "bg-neutral-800/50 border-white/5 text-neutral-500"
                                                   )}
                                               >
                                                   {sys}
                                                   {hasConfig && !isSelected && (
                                                       <span className="ml-1 text-xs text-green-400">●</span>
                                                   )}
                                               </button>
                                           );
                                       })}
                                   </div>
                                   <p className="text-xs text-neutral-600 mt-2">
                                       <span className="text-green-400">●</span> indicates systems with configured scorecards
                                   </p>
                               </div>
                           )}
                           
                           {/* Aggregate Scores Display */}
                           {scorecardAggregates && scorecardAggregates.totalSubmissions > 0 && (
                               <div className="p-4 rounded-lg bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20">
                                   <div className="flex items-center justify-between mb-4">
                                       <h3 className="text-white font-bold">Aggregate Scores</h3>
                                       <span className="text-sm text-neutral-400">
                                           {scorecardAggregates.totalSubmissions} reviewer{scorecardAggregates.totalSubmissions !== 1 ? 's' : ''}
                                       </span>
                                   </div>
                                   
                                   {/* Overall Weighted Average */}
                                   {scorecardAggregates.overallWeightedAverage !== undefined && (
                                       <div className="mb-4 p-3 bg-neutral-900/50 rounded-lg">
                                           <div className="flex items-center justify-between">
                                               <span className="text-sm text-neutral-400">Overall Weighted Average</span>
                                               <span className="text-2xl font-bold text-orange-400">
                                                   {scorecardAggregates.overallWeightedAverage.toFixed(2)}
                                               </span>
                                           </div>
                                       </div>
                                   )}
                                   
                                   {/* Individual Field Averages */}
                                   <div className="space-y-3">
                                       {scorecardAggregates.scores.map((score: any) => (
                                           <div key={score.fieldId} className="flex items-center gap-4">
                                               <div className="flex-1">
                                                   <div className="flex items-center justify-between mb-1">
                                                       <span className="text-sm text-white">{score.fieldLabel}</span>
                                                       <div className="flex items-center gap-2">
                                                           <span className="text-sm font-medium text-orange-400">
                                                               {score.average.toFixed(2)}
                                                           </span>
                                                           <span className="text-xs text-neutral-500">
                                                               / {score.max}
                                                           </span>
                                                           {score.weight && (
                                                               <span className="text-xs text-neutral-600">
                                                                   (w: {score.weight})
                                                               </span>
                                                           )}
                                                       </div>
                                                   </div>
                                                   <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                                                       <div 
                                                           className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all"
                                                           style={{ width: `${(score.average / score.max) * 100}%` }}
                                                       />
                                                   </div>
                                               </div>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}

                           {/* Individual Reviewer Submissions */}
                           {isPrivilegedUser && allScorecardSubmissions.length > 0 && (
                               <div className="p-4 rounded-lg bg-neutral-900/50 border border-white/5">
                                   <h3 className="text-white font-bold mb-4">Individual Submissions</h3>
                                   <div className="space-y-3">
                                       {allScorecardSubmissions.map((sub) => (
                                           <div 
                                               key={sub.id} 
                                               className="p-3 bg-neutral-800/50 rounded-lg border border-white/5"
                                           >
                                               <div className="flex items-center justify-between mb-2">
                                                   <span className="text-sm font-medium text-white">{sub.reviewerName}</span>
                                                   <span className="text-xs text-neutral-500">
                                                       {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : ''}
                                                   </span>
                                               </div>
                                               <div className="flex flex-wrap gap-2">
                                                   {scorecardConfig.fields
                                                       .filter(f => f.type === "rating")
                                                       .map(field => {
                                                           const value = sub.data[field.id];
                                                           return (
                                                               <div 
                                                                   key={field.id}
                                                                   className="px-2 py-1 bg-neutral-700/50 rounded text-xs"
                                                               >
                                                                   <span className="text-neutral-400">{field.label}: </span>
                                                                   <span className="text-white font-medium">
                                                                       {typeof value === 'number' ? value : '-'}
                                                                   </span>
                                                               </div>
                                                           );
                                                       })}
                                                   {/* Boolean and text fields */}
                                                   {scorecardConfig.fields
                                                       .filter(f => f.type === "boolean")
                                                       .map(field => {
                                                           const value = sub.data[field.id];
                                                           return (
                                                               <div 
                                                                   key={field.id}
                                                                   className={clsx(
                                                                       "px-2 py-1 rounded text-xs",
                                                                       value === true ? "bg-green-500/20 text-green-400" :
                                                                       value === false ? "bg-red-500/20 text-red-400" :
                                                                       "bg-neutral-700/50 text-neutral-400"
                                                                   )}
                                                               >
                                                                   {field.label}: {value === true ? 'Yes' : value === false ? 'No' : '-'}
                                                               </div>
                                                           );
                                                       })}
                                               </div>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}
                           
                           {/* My Scorecard Form */}
                           <div className="border-t border-white/5 pt-6">
                               <h3 className="text-white font-bold mb-4">Your Scorecard</h3>
                               <form onSubmit={handleScorecardSubmit} className="space-y-6">
                           {scorecardConfig.fields.map(field => (
                               <div key={field.id} className="p-4 rounded-lg bg-neutral-900 border border-white/5">
                                   <label className="block text-sm font-bold text-white mb-1">
                                       {field.label} {field.required && <span className="text-red-500">*</span>}
                                   </label>
                                   {field.description && <p className="text-xs text-neutral-500 mb-3">{field.description}</p>}
                                   
                                   {field.type === "rating" && (
                                       <div className="flex items-center gap-4">
                                            {[1, 2, 3, 4, 5].map(val => (
                                                <label key={val} className="flex flex-col items-center cursor-pointer group">
                                                    <input 
                                                      type="radio" 
                                                      name={field.id} 
                                                      value={val}
                                                      checked={scorecardData[field.id] === val}
                                                      onChange={() => setScorecardData(prev => ({ ...prev, [field.id]: val }))}
                                                      className="hidden"
                                                    />
                                                    <div className={clsx(
                                                        "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all border",
                                                        scorecardData[field.id] === val 
                                                          ? "bg-orange-500 text-white border-orange-500" 
                                                          : "bg-neutral-800 text-neutral-400 border-white/10 group-hover:border-orange-500/50"
                                                    )}>
                                                        {val}
                                                    </div>
                                                </label>
                                            ))}
                                       </div>
                                   )}

                                   {field.type === "text" && (
                                       <input 
                                         type="text" 
                                         className="w-full bg-neutral-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
                                         value={scorecardData[field.id] || ""}
                                         onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                                       />
                                   )}

                                    {field.type === "long_text" && (
                                       <textarea 
                                         className="w-full bg-neutral-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 h-24"
                                         value={scorecardData[field.id] || ""}
                                         onChange={(e) => setScorecardData(prev => ({ ...prev, [field.id]: e.target.value }))}
                                       />
                                   )}

                                   {field.type === "boolean" && (
                                       <div className="flex gap-4">
                                           <button 
                                             type="button"
                                             onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: true }))}
                                             className={clsx(
                                                 "px-4 py-2 rounded text-sm font-medium border transition-colors",
                                                 scorecardData[field.id] === true 
                                                    ? "bg-green-500/20 border-green-500 text-green-400" 
                                                    : "bg-neutral-800 border-white/10 text-neutral-400"
                                             )}
                                           >
                                               Yes
                                           </button>
                                           <button 
                                             type="button"
                                             onClick={() => setScorecardData(prev => ({ ...prev, [field.id]: false }))}
                                             className={clsx(
                                                 "px-4 py-2 rounded text-sm font-medium border transition-colors",
                                                 scorecardData[field.id] === false
                                                    ? "bg-red-500/20 border-red-500 text-red-500" 
                                                    : "bg-neutral-800 border-white/10 text-neutral-400"
                                             )}
                                           >
                                               No
                                           </button>
                                       </div>
                                   )}
                               </div>
                           ))}
                           
                           <div className="flex justify-end">
                               <button 
                                 type="submit" 
                                 disabled={scorecardSaving}
                                 className="px-6 py-2 bg-orange-600 text-white rounded font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
                               >
                                   {scorecardSaving ? "Saving..." : "Save Scorecard"}
                               </button>
                           </div>
                       </form>
                       </div>
                       </div>
                   )
                )}
              </div>
            </div>

            {/* Right Sidebar */}
            <aside className="w-80 flex-shrink-0 border-l border-white/5 bg-neutral-900/30 overflow-y-auto p-6 space-y-8">
               {/* Current Status */}
               <div>
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="font-bold text-white">Current Status</h3>
                   <Clock className="h-4 w-4 text-neutral-500" />
                 </div>
                 
                 {/* Progress Bar (Mock) */}
                 <div className="flex justify-between items-center text-xs font-medium text-neutral-500 mb-2">
                   <span className={clsx(true && "text-orange-500")}>Applied</span>
                   <span className={clsx(selectedApp.status !== "in_progress" && "text-orange-500")}>Review</span>
                   <span>Interview</span>
                   <span>Offer</span>
                 </div>
                 <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-orange-500 w-1/4"></div>
                 </div>

                 {/* Current State Dropdown Mock */}
                 <div className="bg-neutral-800 rounded-lg p-3 text-sm text-white font-medium flex justify-between items-center mb-4">
                    <span>{selectedApp.status.replace("_", " ").toUpperCase()}</span>
                 </div>

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
                     onClick={handleAdvanceClick} // Updated onClick to use the new handler
                     className="flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-500 transition-colors shadow-lg shadow-orange-900/20 disabled:opacity-50"
                   >
                     <CheckCircle className="h-4 w-4" /> Advance
                   </button>
                 </div>
               </div>

               <div className="h-px bg-white/5" />

               {/* Interview Offers & Preferred Systems */}
                <div>
                  <h3 className="font-bold text-white mb-4">System Status</h3>
                  
                  {/* Preferred Systems */}
                  <div className="mb-4">
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Applicant Interests</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedApp.preferredSystems || (selectedApp.preferredSystem ? [selectedApp.preferredSystem] : [])).length > 0 ? (
                        (selectedApp.preferredSystems || (selectedApp.preferredSystem ? [selectedApp.preferredSystem] : [])).map(sys => (
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

                  {/* Interview Offers */}
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Interview Offers</p>
                    {selectedApp.interviewOffers && selectedApp.interviewOffers.length > 0 ? (
                      <div className="space-y-2">
                        {selectedApp.interviewOffers.map((offer, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-2 bg-neutral-800/50 rounded-lg border border-white/5"
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

                  {/* Rejected By Systems */}
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

               {/* Team Notes */}
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
               
               {/* Tasks */}
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
             <div className="text-5xl mb-4">👋</div>
             <p className="text-lg font-medium">Select an applicant to view details</p>
          </div>
        )}
      </main>

      {/* Interview Systems Selection Modal */}
      {showInterviewModal && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Extend Interview Offers</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Select which systems to extend interview offers for. The applicant expressed interest in the highlighted systems.
            </p>
            
            <div className="space-y-2 mb-6">
              {getTeamSystemOptions().map((sys) => {
                const appSystems = selectedApp.preferredSystems || 
                  (selectedApp.preferredSystem ? [selectedApp.preferredSystem] : []);
                const isPreferred = appSystems.includes(sys.value as any);
                const isChecked = selectedInterviewSystems.includes(sys.value);
                
                return (
                  <label
                    key={sys.value}
                    className={clsx(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isChecked
                        ? "bg-orange-500/10 border-orange-500/50"
                        : "bg-neutral-800 border-white/10 hover:border-white/20"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setSelectedInterviewSystems(prev =>
                          e.target.checked
                            ? [...prev, sys.value]
                            : prev.filter(s => s !== sys.value)
                        );
                      }}
                      className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-orange-600 focus:ring-orange-600 focus:ring-offset-neutral-900"
                    />
                    <span className="text-white font-medium">{sys.label}</span>
                    {isPreferred && (
                      <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                        Applicant Interest
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowInterviewModal(false)}
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                disabled={selectedInterviewSystems.length === 0 || statusLoading}
                onClick={() => handleStatusUpdate(ApplicationStatus.INTERVIEW, selectedInterviewSystems)}
                className="flex-1 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-500 transition-colors disabled:opacity-50"
              >
                {statusLoading ? "Extending..." : `Extend Offers (${selectedInterviewSystems.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Reject from Systems</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Select which systems to reject the applicant from. The application will only be marked as "Rejected" if no interview offers remain.
            </p>
            
            <div className="space-y-2 mb-6">
              {getTeamSystemOptions().map((sys) => {
                const hasOffer = selectedApp.interviewOffers?.some(o => o.system === sys.value);
                const isAlreadyRejected = selectedApp.rejectedBySystems?.includes(sys.value);
                const isPreferred = (selectedApp.preferredSystems || 
                  (selectedApp.preferredSystem ? [selectedApp.preferredSystem] : [])).includes(sys.value as any);
                const isChecked = selectedRejectSystems.includes(sys.value);
                
                // Role-based restriction: non-admin/non-captain can only reject from their own system
                const isHigherAuthority = currentUser?.role === UserRole.ADMIN || 
                                          currentUser?.role === UserRole.TEAM_CAPTAIN_OB;
                const isOwnSystem = currentUser?.memberProfile?.system === sys.value;
                const canRejectFromSystem = isHigherAuthority || isOwnSystem;
                // Can reject from any preferred system (not just those with offers), but must have permission
                const isDisabled = !canRejectFromSystem || isAlreadyRejected;
                
                return (
                  <label
                    key={sys.value}
                    className={clsx(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isChecked
                        ? "bg-red-500/10 border-red-500/50"
                        : "bg-neutral-800 border-white/10 hover:border-white/20",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(e) => {
                        if (isDisabled) return;
                        setSelectedRejectSystems(prev =>
                          e.target.checked
                            ? [...prev, sys.value]
                            : prev.filter(s => s !== sys.value)
                        );
                      }}
                      className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-red-600 focus:ring-red-600 focus:ring-offset-neutral-900"
                    />
                    <span className="text-white font-medium">{sys.label}</span>
                    {hasOffer && (
                      <span className="ml-auto text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                        Has Offer
                      </span>
                    )}
                    {isAlreadyRejected && (
                      <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                        Already Rejected
                      </span>
                    )}
                    {!isHigherAuthority && !isOwnSystem && !isAlreadyRejected && (
                      <span className="ml-auto text-xs bg-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full">
                        Not your system
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                disabled={selectedRejectSystems.length === 0 || statusLoading}
                onClick={handleRejectSubmit}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {statusLoading ? "Rejecting..." : `Reject (${selectedRejectSystems.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
