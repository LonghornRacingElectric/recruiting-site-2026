"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useApplications } from "./ApplicationsContext";
import { ApplicationStatus } from "@/lib/models/Application";
import { Team, UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { format } from "date-fns";
import { Search, ArrowUpDown, Star, MessageSquare, Loader2 } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Helper to check if recruiting step is at or past a certain stage
const RECRUITING_STEP_ORDER: RecruitingStep[] = [
  RecruitingStep.OPEN,
  RecruitingStep.REVIEWING,
  RecruitingStep.RELEASE_INTERVIEWS,
  RecruitingStep.INTERVIEWING,
  RecruitingStep.RELEASE_TRIAL,
  RecruitingStep.TRIAL_WORKDAY,
  RecruitingStep.RELEASE_DECISIONS,
];

function isRecruitingStepAtOrPast(currentStep: RecruitingStep | null, targetStep: RecruitingStep): boolean {
  if (!currentStep) return false;
  const currentIndex = RECRUITING_STEP_ORDER.indexOf(currentStep);
  const targetIndex = RECRUITING_STEP_ORDER.indexOf(targetStep);
  return currentIndex >= targetIndex;
}

// Status Badge Component
function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles = {
    [ApplicationStatus.IN_PROGRESS]: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    [ApplicationStatus.SUBMITTED]: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    [ApplicationStatus.INTERVIEW]: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    [ApplicationStatus.ACCEPTED]: "bg-green-500/10 text-green-400 border-green-500/20",
    [ApplicationStatus.REJECTED]: "bg-red-500/10 text-red-500 border-red-500/20",
    [ApplicationStatus.TRIAL]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  const labels: Record<string, string> = {
    [ApplicationStatus.IN_PROGRESS]: "In Progress",
    [ApplicationStatus.SUBMITTED]: "Submitted",
    [ApplicationStatus.INTERVIEW]: "Interview",
    [ApplicationStatus.ACCEPTED]: "Accepted",
    [ApplicationStatus.REJECTED]: "Rejected",
    [ApplicationStatus.TRIAL]: "Trial",
  };

  return (
    <span className={clsx("px-2.5 py-0.5 text-xs font-medium rounded-full border", styles[status])}>
      {labels[status] || status}
    </span>
  );
}

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

function getDisplayStatusForUser(
  app: any,
  user: any
): ApplicationStatus {
  if (!user ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.TEAM_CAPTAIN_OB) {
    return app.status;
  }

  const userSystem = user.memberProfile?.system;
  if (!userSystem) {
    return app.status;
  }

  const rejectedBySystems = app.rejectedBySystems || [];
  const userSystemRejected = rejectedBySystems.includes(userSystem);

  if (userSystemRejected) {
    return ApplicationStatus.REJECTED;
  }

  if (app.status === ApplicationStatus.REJECTED) {
    if (app.trialOffers && app.trialOffers.length > 0) {
      return ApplicationStatus.TRIAL;
    }
    if (app.interviewOffers && app.interviewOffers.length > 0) {
      return ApplicationStatus.INTERVIEW;
    }
    return ApplicationStatus.SUBMITTED;
  }

  return app.status;
}

export default function ApplicationsSidebar() {
  const { applications, loading, loadingMore, hasMore, loadMore, currentUser, recruitingStep, sortBy, sortDirection, setSortBy, setSortDirection, searchTerm, setSearchTerm } = useApplications();
  const [statusFilters, setStatusFilters] = useState<ApplicationStatus[]>([]);
  const [systemFilters, setSystemFilters] = useState<string[]>([]);
  const [teamFilters, setTeamFilters] = useState<string[]>([]);
  const [showOnlyUnreviewedByMySystem, setShowOnlyUnreviewedByMySystem] = useState(false);
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || loadingMore || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when within 200px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMore();
    }
  }, [loadingMore, hasMore, loadMore]);
  
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  // Check if user can see ratings (System Lead or Reviewer only)
  const canSeeRatings = currentUser?.role === UserRole.SYSTEM_LEAD || currentUser?.role === UserRole.REVIEWER;
  
  // Check if interview ratings should be shown (at RELEASE_INTERVIEWS or later)
  const showInterviewRatings = canSeeRatings && isRecruitingStepAtOrPast(recruitingStep, RecruitingStep.RELEASE_INTERVIEWS);

  // Extract selected ID from pathname
  // Expected path: /admin/applications/[id]
  const selectedAppId = pathname.split('/').pop();
  const isSelected = (id: string) => selectedAppId === id;

  const filteredApplications = applications.filter(app => {
    // Note: name/email search is now handled server-side
    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(app.status);
    const appSystems = app.preferredSystems || [];
    const matchesSystem = systemFilters.length === 0 || appSystems.some(s => systemFilters.includes(s));
    const matchesTeam = teamFilters.length === 0 || teamFilters.includes(app.team);
    
    let matchesUnreviewedFilter = true;
    if (showOnlyUnreviewedByMySystem && currentUser?.memberProfile?.system) {
      const userSystem = currentUser.memberProfile.system;
      const hasInterviewOffer = app.interviewOffers?.some(o => o.system === userSystem);
      const hasTrialOffer = app.trialOffers?.some(o => o.system === userSystem);
      const hasRejected = app.rejectedBySystems?.includes(userSystem);
      matchesUnreviewedFilter = !hasInterviewOffer && !hasTrialOffer && !hasRejected;
    }
    
    return matchesStatus && matchesSystem && matchesTeam && matchesUnreviewedFilter;
  });

  if (loading) {
    return (
      <div className="w-80 flex items-center justify-center p-12 text-neutral-500 border-r border-white/5 bg-neutral-900/30">
        <div className="animate-spin h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full mr-3"></div>
        Loading...
      </div>
    );
  }

  return (
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
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
            
            {(() => {
              const allTeams = [...new Set(applications.map(a => a.team))];
              const applicableTeams = teamFilters.length > 0 ? teamFilters : (allTeams.length === 1 ? allTeams : []);
              
              if (applicableTeams.length === 0) return null;
              
              const systemsByTeam = applicableTeams.map(team => ({
                team,
                systems: TEAM_SYSTEMS[team as Team]?.map(s => s.value) || []
              })).filter(t => t.systems.length > 0);
              
              if (systemsByTeam.length === 0) return null;
              
              const showTeamPrefix = applicableTeams.length > 1;
              
              return (
                <>
                  <div className="text-xs text-neutral-500 mb-1 mt-3">System</div>
                  <div className="space-y-2">
                    {systemsByTeam.map(({ team, systems }) => (
                      <div key={team}>
                        {showTeamPrefix && (
                          <div className="text-[10px] text-neutral-600 mb-1 uppercase tracking-wider">{team}</div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {systems.map(system => (
                            <button
                              key={`${team}-${system}`}
                              onClick={() => setSystemFilters(prev => 
                                prev.includes(system) ? prev.filter(s => s !== system) : [...prev, system]
                              )}
                              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                                systemFilters.includes(system)
                                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                  : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                              }`}
                            >
                              {system}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {currentUser?.memberProfile?.system && (
              <>
                <div className="text-xs text-neutral-500 mb-1 mt-3">Quick Filter</div>
                <button
                  onClick={() => setShowOnlyUnreviewedByMySystem(prev => !prev)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    showOnlyUnreviewedByMySystem
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  Unreviewed by {currentUser.memberProfile.system}
                </button>
              </>
            )}
            
            {(statusFilters.length > 0 || systemFilters.length > 0 || teamFilters.length > 0 || showOnlyUnreviewedByMySystem) && (
              <button
                onClick={() => { setStatusFilters([]); setSystemFilters([]); setTeamFilters([]); setShowOnlyUnreviewedByMySystem(false); }}
                className="mt-2 text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Clear filters
              </button>
            )}
            
            {/* Sort Controls */}
            <div className="text-xs text-neutral-500 mb-1 mt-3">Sort By</div>
            <div className="flex gap-1 items-center flex-wrap">
              <button
                onClick={() => { 
                  if (sortBy === "date") {
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc"); 
                  } else {
                    setSortBy("date"); 
                    setSortDirection("desc");
                  }
                }}
                className={`px-2 py-1 text-xs rounded-md border transition-colors flex items-center gap-1 ${
                  sortBy === "date"
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                }`}
              >
                Date {sortBy === "date" && (sortDirection === "asc" ? "↑" : "↓")}
              </button>
              <button
                onClick={() => { 
                  if (sortBy === "name") {
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc"); 
                  } else {
                    setSortBy("name"); 
                    setSortDirection("asc");
                  }
                }}
                className={`px-2 py-1 text-xs rounded-md border transition-colors flex items-center gap-1 ${
                  sortBy === "name"
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                }`}
              >
                Name {sortBy === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </button>
              {canSeeRatings && (
                <button
                  onClick={() => { 
                    if (sortBy === "rating") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc"); 
                    } else {
                      setSortBy("rating"); 
                      setSortDirection("desc");
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors flex items-center gap-1 ${
                    sortBy === "rating"
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <Star className="h-3 w-3" />Review {sortBy === "rating" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              )}
              {showInterviewRatings && (
                <button
                  onClick={() => { 
                    if (sortBy === "interviewRating") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc"); 
                    } else {
                      setSortBy("interviewRating"); 
                      setSortDirection("desc");
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors flex items-center gap-1 ${
                    sortBy === "interviewRating"
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-neutral-800 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />Interview {sortBy === "interviewRating" && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              )}
            </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
         {filteredApplications.map(app => (
           <Link 
             key={app.id}
             href={`/admin/applications/${app.id}`}
             className={clsx(
               "block p-4 border-b border-white/5 cursor-pointer hover:bg-neutral-800/50 transition-colors",
               isSelected(app.id) ? "bg-orange-500/5 border-l-2 border-l-orange-500" : "border-l-2 border-l-transparent"
             )}
           >
              <div className="flex justify-between items-start mb-1">
                <h3 className={clsx("font-medium text-sm truncate pr-2", isSelected(app.id) ? "text-white" : "text-neutral-300")}>
                  {app.user.name || "Unknown Applicant"}
                </h3>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{format(new Date(app.createdAt), "MMM d")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
                <span className={clsx(app.team === "Electric" && "text-yellow-500", app.team === "Solar" && "text-blue-500", app.team === "Combustion" && "text-red-500")}>
                  {app.team}
                </span>
                <span>•</span>
                <span>{(app.preferredSystems?.length ? app.preferredSystems.join(", ") : "General")}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={getDisplayStatusForUser(app, currentUser)} />
                {canSeeRatings && app.aggregateRating !== null && app.aggregateRating !== undefined && (
                  <span className={clsx(
                    "px-2 py-0.5 text-xs font-medium rounded-full border flex items-center gap-1",
                    app.aggregateRating >= 4 ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    app.aggregateRating >= 3 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                    "bg-red-500/10 text-red-400 border-red-500/20"
                  )}>
                    <Star className="h-3 w-3" />
                    {app.aggregateRating.toFixed(1)}
                  </span>
                )}
                {showInterviewRatings && app.interviewAggregateRating !== null && app.interviewAggregateRating !== undefined && (
                  <span className={clsx(
                    "px-2 py-0.5 text-xs font-medium rounded-full border flex items-center gap-1",
                    app.interviewAggregateRating >= 4 ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    app.interviewAggregateRating >= 3 ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    "bg-red-500/10 text-red-400 border-red-500/20"
                  )}>
                    <MessageSquare className="h-3 w-3" />
                    {app.interviewAggregateRating.toFixed(1)}
                  </span>
                )}
              </div>
           </Link>
         ))}
         {loadingMore && (
           <div className="p-4 flex items-center justify-center text-neutral-500">
             <Loader2 className="h-5 w-5 animate-spin mr-2" />
             <span className="text-sm">Loading more...</span>
           </div>
         )}
         {!loadingMore && hasMore && filteredApplications.length > 0 && (
           <button
             onClick={() => loadMore()}
             className="w-full p-4 text-sm font-medium text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border-y border-orange-500/30 transition-colors flex items-center justify-center gap-2"
           >
             <Loader2 className="h-4 w-4" />
             Load more applications
           </button>
         )}
         {filteredApplications.length === 0 && (
           <div className="p-8 text-center text-neutral-500 text-sm">
             {searchTerm ? "No matches found." : "No applications found."}
           </div>
         )}
      </div>
    </aside>
  );
}
