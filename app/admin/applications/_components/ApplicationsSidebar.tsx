"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useApplications } from "./ApplicationsContext";
import { ApplicationStatus } from "@/lib/models/Application";
import { Team, UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import { format } from "date-fns";
import { Search, Star, MessageSquare, Loader2, Users } from "lucide-react";
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

const TEAM_DOT_COLORS: Record<string, string> = {
  Electric: "var(--lhr-blue)",
  Solar: "var(--lhr-gold)",
  Combustion: "var(--lhr-orange)",
};

// Status Badge Component
function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, { bg: string; border: string; color: string }> = {
    [ApplicationStatus.IN_PROGRESS]: { bg: "rgba(255,181,38,0.08)", border: "rgba(255,181,38,0.18)", color: "rgba(255,181,38,0.7)" },
    [ApplicationStatus.SUBMITTED]: { bg: "rgba(4,95,133,0.1)", border: "rgba(4,95,133,0.2)", color: "rgba(4,95,133,0.9)" },
    [ApplicationStatus.INTERVIEW]: { bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.18)", color: "rgba(6,182,212,0.8)" },
    [ApplicationStatus.ACCEPTED]: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", color: "rgba(34,197,94,0.8)" },
    [ApplicationStatus.REJECTED]: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.8)" },
    [ApplicationStatus.TRIAL]: { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.18)", color: "rgba(168,85,247,0.8)" },
    [ApplicationStatus.WAITLISTED]: { bg: "rgba(255,148,4,0.08)", border: "rgba(255,148,4,0.18)", color: "rgba(255,148,4,0.8)" },
  };

  const labels: Record<ApplicationStatus, string> = {
    [ApplicationStatus.IN_PROGRESS]: "In Progress",
    [ApplicationStatus.SUBMITTED]: "Submitted",
    [ApplicationStatus.INTERVIEW]: "Interview",
    [ApplicationStatus.ACCEPTED]: "Accepted",
    [ApplicationStatus.REJECTED]: "Rejected",
    [ApplicationStatus.TRIAL]: "Trial",
    [ApplicationStatus.WAITLISTED]: "Waitlisted",
  };

  const s = styles[status];

  return (
    <span
      className="px-2 py-0.5 text-[11px] font-semibold rounded-full font-urbanist"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
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
  [ApplicationStatus.WAITLISTED]: "Waitlisted",
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

// Filter pill component
function FilterPill({
  label,
  active,
  onClick,
  activeColor = "var(--lhr-blue)",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[11px] font-semibold rounded-md font-urbanist transition-all duration-150"
      style={
        active
          ? {
              backgroundColor: `color-mix(in srgb, ${activeColor} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${activeColor} 40%, transparent)`,
              color: activeColor,
            }
          : {
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.35)",
            }
      }
    >
      {label}
    </button>
  );
}

// Sort pill
function SortPill({
  label,
  icon,
  active,
  direction,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  direction?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md font-urbanist transition-all duration-150"
      style={
        active
          ? {
              backgroundColor: "rgba(4,95,133,0.12)",
              border: "1px solid rgba(4,95,133,0.3)",
              color: "var(--lhr-blue)",
            }
          : {
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.35)",
            }
      }
    >
      {icon}
      {label} {active && (direction === "asc" ? "↑" : "↓")}
    </button>
  );
}

export default function ApplicationsSidebar() {
  const { applications, loading, refetching, loadingMore, hasMore, loadMore, currentUser, recruitingStep, sortBy, sortDirection, setSortBy, setSortDirection, searchTerm, setSearchTerm } = useApplications();
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
      <div
        className="w-80 flex items-center justify-center p-12"
        style={{ borderRight: "1px solid rgba(255,255,255,0.04)", backgroundColor: "rgba(255,255,255,0.01)" }}
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[13px] text-white/30">Loading applicants...</span>
        </div>
      </div>
    );
  }

  return (
    <aside
      className="w-80 flex-shrink-0 flex flex-col"
      style={{ borderRight: "1px solid rgba(255,255,255,0.04)", backgroundColor: "rgba(255,255,255,0.01)" }}
    >
      <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" style={{ color: "var(--lhr-blue)" }} />
            <span className="font-montserrat text-[12px] font-bold text-white/60 uppercase tracking-wider">Applicants</span>
          </div>
          <span
            className="text-[11px] font-semibold font-urbanist px-2 py-0.5 rounded-md"
            style={{ backgroundColor: "rgba(4,95,133,0.1)", color: "var(--lhr-blue)", border: "1px solid rgba(4,95,133,0.2)" }}
          >
            {filteredApplications.length === applications.length
              ? applications.length
              : `${filteredApplications.length} / ${applications.length}`}
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 rounded-lg pl-9 pr-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          />
        </div>

        {/* Filters */}
        <div className="space-y-2.5">
          {/* Team Filters */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Team</div>
            <div className="flex flex-wrap gap-1">
              {[...new Set(applications.map(a => a.team))].map(team => (
                <FilterPill
                  key={team}
                  label={team}
                  active={teamFilters.includes(team)}
                  onClick={() => setTeamFilters(prev =>
                    prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
                  )}
                  activeColor={TEAM_DOT_COLORS[team] || "var(--lhr-blue)"}
                />
              ))}
            </div>
          </div>

          {/* Status Filters */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Status</div>
            <div className="flex flex-wrap gap-1">
              {Object.values(ApplicationStatus).map(status => (
                <FilterPill
                  key={status}
                  label={getStatusLabel(status)}
                  active={statusFilters.includes(status)}
                  onClick={() => setStatusFilters(prev =>
                    prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                  )}
                  activeColor="var(--lhr-gold)"
                />
              ))}
            </div>
          </div>

          {/* System Filters */}
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
              <div>
                <div className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>System</div>
                <div className="space-y-2">
                  {systemsByTeam.map(({ team, systems }) => (
                    <div key={team}>
                      {showTeamPrefix && (
                        <div className="text-[9px] font-semibold tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.15)" }}>{team}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {systems.map(system => (
                          <FilterPill
                            key={`${team}-${system}`}
                            label={system}
                            active={systemFilters.includes(system)}
                            onClick={() => setSystemFilters(prev =>
                              prev.includes(system) ? prev.filter(s => s !== system) : [...prev, system]
                            )}
                            activeColor="var(--lhr-blue)"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Quick Filter */}
          {currentUser?.memberProfile?.system && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Quick Filter</div>
              <FilterPill
                label={`Unreviewed by ${currentUser.memberProfile.system}`}
                active={showOnlyUnreviewedByMySystem}
                onClick={() => setShowOnlyUnreviewedByMySystem(prev => !prev)}
                activeColor="#a855f7"
              />
            </div>
          )}

          {/* Clear Filters */}
          {(statusFilters.length > 0 || systemFilters.length > 0 || teamFilters.length > 0 || showOnlyUnreviewedByMySystem) && (
            <button
              onClick={() => { setStatusFilters([]); setSystemFilters([]); setTeamFilters([]); setShowOnlyUnreviewedByMySystem(false); }}
              className="text-[11px] font-urbanist font-medium transition-colors"
              style={{ color: "rgba(255,255,255,0.25)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
            >
              Clear all filters
            </button>
          )}

          {/* Sort Controls */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: "var(--lhr-gray-blue)" }}>Sort By</div>
            <div className="flex gap-1 items-center flex-wrap">
              <SortPill
                label="Date"
                active={sortBy === "date"}
                direction={sortDirection}
                onClick={() => {
                  if (sortBy === "date") {
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("date");
                    setSortDirection("desc");
                  }
                }}
              />
              <SortPill
                label="Name"
                active={sortBy === "name"}
                direction={sortDirection}
                onClick={() => {
                  if (sortBy === "name") {
                    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("name");
                    setSortDirection("asc");
                  }
                }}
              />
              {canSeeRatings && (
                <SortPill
                  label="Review"
                  icon={<Star className="h-3 w-3" />}
                  active={sortBy === "rating"}
                  direction={sortDirection}
                  onClick={() => {
                    if (sortBy === "rating") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortBy("rating");
                      setSortDirection("desc");
                    }
                  }}
                />
              )}
              {showInterviewRatings && (
                <SortPill
                  label="Interview"
                  icon={<MessageSquare className="h-3 w-3" />}
                  active={sortBy === "interviewRating"}
                  direction={sortDirection}
                  onClick={() => {
                    if (sortBy === "interviewRating") {
                      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setSortBy("interviewRating");
                      setSortDirection("desc");
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Refetching indicator */}
      {refetching && (
        <div className="flex items-center justify-center gap-2 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[11px] text-white/25">Updating...</span>
        </div>
      )}

      {/* Application List */}
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
         {filteredApplications.map(app => {
           const teamColor = TEAM_DOT_COLORS[app.team] || "var(--lhr-blue)";
           return (
             <Link
               key={app.id}
               href={`/admin/applications/${app.id}`}
               className="block transition-colors"
               style={{
                 padding: "14px 16px",
                 borderBottom: "1px solid rgba(255,255,255,0.03)",
                 borderLeft: isSelected(app.id) ? `2px solid var(--lhr-blue)` : "2px solid transparent",
                 backgroundColor: isSelected(app.id) ? "rgba(4,95,133,0.06)" : "transparent",
               }}
               onMouseEnter={(e) => { if (!isSelected(app.id)) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
               onMouseLeave={(e) => { if (!isSelected(app.id)) e.currentTarget.style.backgroundColor = "transparent"; }}
             >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={clsx("font-montserrat text-[13px] font-semibold truncate pr-2", isSelected(app.id) ? "text-white" : "text-white/70")}>
                    {app.user.name || "Unknown Applicant"}
                  </h3>
                  <span className="text-[11px] font-urbanist text-white/25 whitespace-nowrap">{format(new Date(app.createdAt), "MMM d")}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-urbanist text-white/30 mb-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: teamColor }}
                  />
                  <span style={{ color: teamColor }}>{app.team}</span>
                  <span className="text-white/15">·</span>
                  <span className="truncate">{(app.preferredSystems?.length ? app.preferredSystems.join(", ") : "General")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={getDisplayStatusForUser(app, currentUser)} />
                  {canSeeRatings && app.aggregateRating !== null && app.aggregateRating !== undefined && (
                    <span
                      className="px-2 py-0.5 text-[11px] font-semibold rounded-full flex items-center gap-1 font-urbanist"
                      style={{
                        backgroundColor: app.aggregateRating >= 4 ? "rgba(34,197,94,0.08)" : app.aggregateRating >= 3 ? "rgba(255,181,38,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${app.aggregateRating >= 4 ? "rgba(34,197,94,0.18)" : app.aggregateRating >= 3 ? "rgba(255,181,38,0.18)" : "rgba(239,68,68,0.18)"}`,
                        color: app.aggregateRating >= 4 ? "rgba(34,197,94,0.8)" : app.aggregateRating >= 3 ? "rgba(255,181,38,0.7)" : "rgba(239,68,68,0.8)",
                      }}
                    >
                      <Star className="h-3 w-3" />
                      {app.aggregateRating.toFixed(1)}
                    </span>
                  )}
                  {showInterviewRatings && app.interviewAggregateRating !== null && app.interviewAggregateRating !== undefined && (
                    <span
                      className="px-2 py-0.5 text-[11px] font-semibold rounded-full flex items-center gap-1 font-urbanist"
                      style={{
                        backgroundColor: app.interviewAggregateRating >= 4 ? "rgba(34,197,94,0.08)" : app.interviewAggregateRating >= 3 ? "rgba(4,95,133,0.1)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${app.interviewAggregateRating >= 4 ? "rgba(34,197,94,0.18)" : app.interviewAggregateRating >= 3 ? "rgba(4,95,133,0.2)" : "rgba(239,68,68,0.18)"}`,
                        color: app.interviewAggregateRating >= 4 ? "rgba(34,197,94,0.8)" : app.interviewAggregateRating >= 3 ? "var(--lhr-blue)" : "rgba(239,68,68,0.8)",
                      }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      {app.interviewAggregateRating.toFixed(1)}
                    </span>
                  )}
                </div>
             </Link>
           );
         })}
         {loadingMore && (
           <div className="p-4 flex items-center justify-center">
             <Loader2 className="h-4 w-4 animate-spin mr-2" style={{ color: "var(--lhr-blue)" }} />
             <span className="font-urbanist text-[12px] text-white/30">Loading more...</span>
           </div>
         )}
         {!loadingMore && hasMore && filteredApplications.length > 0 && (
           <button
             onClick={() => loadMore()}
             className="w-full p-3 font-urbanist text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
             style={{
               color: "var(--lhr-blue)",
               backgroundColor: "rgba(4,95,133,0.05)",
               borderTop: "1px solid rgba(4,95,133,0.1)",
               borderBottom: "1px solid rgba(4,95,133,0.1)",
             }}
             onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(4,95,133,0.1)"; }}
             onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(4,95,133,0.05)"; }}
           >
             <Loader2 className="h-3.5 w-3.5" />
             Load more applications
           </button>
         )}
         {filteredApplications.length === 0 && (
           <div className="p-8 text-center">
             <p className="font-urbanist text-[13px] text-white/25">
               {searchTerm ? "No matches found." : "No applications found."}
             </p>
           </div>
         )}
      </div>
    </aside>
  );
}
