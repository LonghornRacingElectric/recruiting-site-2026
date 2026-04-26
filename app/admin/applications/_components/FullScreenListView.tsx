"use client";

import React, { useState, useMemo, Fragment } from "react";
import { ApplicationStatus } from "@/lib/models/Application";
import { UserRole } from "@/lib/models/User";
import { RecruitingStep } from "@/lib/models/Config";
import { isAtOrPast } from "@/lib/utils/statusUtils";
import { format } from "date-fns";
import { Search, Star, MessageSquare, Users, X, CheckSquare, Square, Loader2, AlertCircle, Check, ChevronDown, ChevronRight, LayoutList, Layers } from "lucide-react";
import clsx from "clsx";

const TEAM_DOT_COLORS: Record<string, string> = {
  Electric: "var(--lhr-blue)",
  Solar: "var(--lhr-gold)",
  Combustion: "var(--lhr-orange)",
};

const STATUS_LABELS: Record<string, string> = {
  [ApplicationStatus.IN_PROGRESS]: "In Progress",
  [ApplicationStatus.SUBMITTED]: "Submitted",
  [ApplicationStatus.INTERVIEW]: "Interview",
  [ApplicationStatus.ACCEPTED]: "Accepted",
  [ApplicationStatus.REJECTED]: "Rejected",
  [ApplicationStatus.TRIAL]: "Trial",
  [ApplicationStatus.WAITLISTED]: "Waitlisted",
  [ApplicationStatus.COMMITTED]: "Committed",
  [ApplicationStatus.DECLINED]: "Declined",
};

function getStatusLabel(status: string) { return STATUS_LABELS[status] || status; }

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, { bg: string; border: string; color: string }> = {
    [ApplicationStatus.IN_PROGRESS]: { bg: "rgba(255,181,38,0.08)", border: "rgba(255,181,38,0.18)", color: "rgba(255,181,38,0.7)" },
    [ApplicationStatus.SUBMITTED]: { bg: "rgba(4,95,133,0.1)", border: "rgba(4,95,133,0.2)", color: "rgba(4,95,133,0.9)" },
    [ApplicationStatus.INTERVIEW]: { bg: "rgba(6,182,212,0.08)", border: "rgba(6,182,212,0.18)", color: "rgba(6,182,212,0.8)" },
    [ApplicationStatus.ACCEPTED]: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", color: "rgba(34,197,94,0.8)" },
    [ApplicationStatus.REJECTED]: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.8)" },
    [ApplicationStatus.TRIAL]: { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.18)", color: "rgba(168,85,247,0.8)" },
    [ApplicationStatus.WAITLISTED]: { bg: "rgba(255,148,4,0.08)", border: "rgba(255,148,4,0.18)", color: "rgba(255,148,4,0.8)" },
    [ApplicationStatus.COMMITTED]: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.25)", color: "#4ade80" },
    [ApplicationStatus.DECLINED]: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)", color: "#f87171" },
  };
  const s = styles[status];
  return (
    <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full font-urbanist"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function getDisplayStatusForUser(app: any, user: any): ApplicationStatus {
  if (!user || user.role === UserRole.ADMIN || user.role === UserRole.TEAM_CAPTAIN_OB) return app.status;
  const userSystem = user.memberProfile?.system;
  if (!userSystem) return app.status;
  if (app.rejectedBySystems?.includes(userSystem)) return ApplicationStatus.REJECTED;
  if (app.status === ApplicationStatus.REJECTED) {
    if (app.trialOffers?.length > 0) return ApplicationStatus.TRIAL;
    if (app.interviewOffers?.length > 0) return ApplicationStatus.INTERVIEW;
    return ApplicationStatus.SUBMITTED;
  }
  return app.status;
}

type BulkAction = "accept" | "reject" | "waitlist" | "interview" | "trial" | "submitted";

interface Props {
  applications: any[];
  allApplications: any[];
  currentUser: any;
  recruitingStep: RecruitingStep | null;
  canSeeRatings: boolean;
  showInterviewRatings: boolean;
  onClose: () => void;
  sortBy: string;
  sortDirection: string;
  onSortByChange: (sb: any) => void;
  searchTerm: string;
  onSearchChange: (t: string) => void;
  statusFilters: ApplicationStatus[];
  onStatusFiltersChange: (f: ApplicationStatus[]) => void;
  systemFilters: string[];
  onSystemFiltersChange: (f: string[]) => void;
  teamFilters: string[];
  onTeamFiltersChange: (f: string[]) => void;
  bulkUpdateStatus: (ids: string[], action: BulkAction, systems?: string[]) => Promise<any>;
}

export default function FullScreenListView(props: Props) {
  const {
    applications, currentUser, recruitingStep, canSeeRatings, showInterviewRatings, onClose,
    sortBy, sortDirection, onSortByChange, searchTerm, onSearchChange,
    statusFilters, onStatusFiltersChange, systemFilters, onSystemFiltersChange,
    teamFilters, onTeamFiltersChange, bulkUpdateStatus,
  } = props;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [groupByUser, setGroupByUser] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const canBulkAction = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.TEAM_CAPTAIN_OB || currentUser?.role === UserRole.SYSTEM_LEAD;

  // Determine which actions are allowed based on the recruiting step
  const canInterview = true; // Always allowed
  const canTrial = isAtOrPast(recruitingStep, RecruitingStep.INTERVIEWING);
  const canAcceptWaitlist = isAtOrPast(recruitingStep, RecruitingStep.TRIAL_WORKDAY);
  const canReject = true; // Always allowed
  const canRevert = true; // Always allowed

  const groupedApplications = useMemo(() => {
    if (!groupByUser) return [];
    const map = new Map<string, any[]>();
    applications.forEach(app => {
      const uid = app.userId;
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(app);
    });
    return Array.from(map.entries()).map(([userId, apps]) => {
      // Find all unique teams including otherTeams
      const allTeamsMap = new Map<string, { id?: string, status: string }>();
      apps.forEach(app => {
        allTeamsMap.set(app.team, { id: app.id, status: app.status });
        if (app.otherTeams) {
          app.otherTeams.forEach((ot: any) => {
            if (!allTeamsMap.has(ot.team)) {
              allTeamsMap.set(ot.team, { id: ot.id, status: ot.status });
            }
          });
        }
      });
      return {
        userId,
        user: apps[0].user,
        apps,
        allTeams: Array.from(allTeamsMap.entries()).map(([team, data]) => ({ team, ...data })),
      };
    });
  }, [applications, groupByUser]);

  const toggleExpandUser = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === applications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map(a => a.id)));
    }
  };

  const handleBulkAction = async (action: BulkAction) => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    setBulkResult(null);
    setConfirmAction(null);
    try {
      const systems = currentUser?.memberProfile?.system ? [currentUser.memberProfile.system] : undefined;
      const res = await bulkUpdateStatus(Array.from(selectedIds), action, systems);
      setBulkResult(res.summary);
      setSelectedIds(new Set());
    } catch {
      setBulkResult({ success: 0, failed: selectedIds.size });
    } finally {
      setBulkProcessing(false);
      setTimeout(() => setBulkResult(null), 4000);
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <button onClick={() => onSortByChange(field)}
      className="flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase font-urbanist transition-colors"
      style={{ color: sortBy === field ? 'var(--lhr-blue)' : 'rgba(255,255,255,0.25)' }}>
      {label}
      {sortBy === field && <span className="text-[9px]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  const FilterChip = ({ label, active, onClick, color = 'var(--lhr-blue)' }: { label: string; active: boolean; onClick: () => void; color?: string }) => (
    <button onClick={onClick}
      className="px-2 py-0.5 text-[10px] font-semibold rounded font-urbanist transition-all cursor-pointer"
      style={active
        ? { backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, color }
        : { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
      }>
      {label}
    </button>
  );

  const actionBtnStyle = (color: string, disabled: boolean = false) => ({
    backgroundColor: disabled ? `rgba(255,255,255,0.05)` : `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `color-mix(in srgb, ${color} 30%, transparent)`}`,
    color: disabled ? `rgba(255,255,255,0.3)` : color,
    cursor: disabled ? 'not-allowed' : 'pointer'
  });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: '#030608' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <Users className="h-4 w-4" style={{ color: 'var(--lhr-blue)' }} />
          <h2 className="font-montserrat text-[15px] font-bold text-white">All Applicants</h2>
          <span className="text-[11px] font-semibold font-urbanist px-2 py-0.5 rounded-md"
            style={{ backgroundColor: 'rgba(4,95,133,0.1)', color: 'var(--lhr-blue)', border: '1px solid rgba(4,95,133,0.2)' }}>
            {applications.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Inline search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => onSearchChange(e.target.value)}
              className="h-8 w-56 rounded-lg pl-8 pr-3 text-[12px] font-urbanist text-white placeholder:text-white/20 focus:outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>
          
          {/* Group By Toggle */}
          <button onClick={() => setGroupByUser(!groupByUser)} className="h-8 px-3 rounded-lg flex items-center justify-center transition-colors gap-2"
            style={{ 
              backgroundColor: groupByUser ? 'rgba(4,95,133,0.15)' : 'rgba(255,255,255,0.04)', 
              border: `1px solid ${groupByUser ? 'rgba(4,95,133,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: groupByUser ? 'var(--lhr-blue)' : 'rgba(255,255,255,0.5)'
            }}>
            {groupByUser ? <Layers className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            <span className="text-[11px] font-semibold font-urbanist">{groupByUser ? 'Grouped by Person' : 'List View'}</span>
          </button>

          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <X className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-2 shrink-0 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span className="text-[9px] font-semibold tracking-widest uppercase font-urbanist text-white/20">Status</span>
        {Object.values(ApplicationStatus).map(s => (
          <FilterChip key={s} label={getStatusLabel(s)} active={statusFilters.includes(s)} color="var(--lhr-gold)"
            onClick={() => onStatusFiltersChange(statusFilters.includes(s) ? statusFilters.filter(x => x !== s) : [...statusFilters, s])} />
        ))}
        <span className="text-white/10 mx-1">|</span>
        <span className="text-[9px] font-semibold tracking-widest uppercase font-urbanist text-white/20">Team</span>
        {['Electric', 'Solar', 'Combustion'].map(t => (
          <FilterChip key={t} label={t} active={teamFilters.includes(t)} color={TEAM_DOT_COLORS[t]}
            onClick={() => onTeamFiltersChange(teamFilters.includes(t) ? teamFilters.filter(x => x !== t) : [...teamFilters, t])} />
        ))}
        {(statusFilters.length > 0 || teamFilters.length > 0) && (
          <button onClick={() => { onStatusFiltersChange([]); onTeamFiltersChange([]); }}
            className="text-[10px] font-urbanist text-white/25 hover:text-white/50 ml-1">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0" style={{ backgroundColor: 'rgba(3,6,8,0.97)', backdropFilter: 'blur(8px)' }}>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {canBulkAction && (
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center">
                    {selectedIds.size === applications.length && applications.length > 0
                      ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--lhr-blue)' }} />
                      : <Square className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.15)' }} />}
                  </button>
                </th>
              )}
              <th className="text-left px-5 py-3 w-[240px]"><SortHeader label="Name" field="name" /></th>
              <th className="text-left px-4 py-3"><span className="text-[10px] font-semibold tracking-widest uppercase font-urbanist" style={{ color: 'rgba(255,255,255,0.25)' }}>Team</span></th>
              <th className="text-left px-4 py-3"><span className="text-[10px] font-semibold tracking-widest uppercase font-urbanist" style={{ color: 'rgba(255,255,255,0.25)' }}>Systems</span></th>
              <th className="text-left px-4 py-3"><span className="text-[10px] font-semibold tracking-widest uppercase font-urbanist" style={{ color: 'rgba(255,255,255,0.25)' }}>Status</span></th>
              <th className="text-left px-4 py-3"><span className="text-[10px] font-semibold tracking-widest uppercase font-urbanist" style={{ color: 'rgba(255,255,255,0.25)' }}>Other Teams</span></th>
              {canSeeRatings && <th className="text-left px-4 py-3"><SortHeader label="Review" field="rating" /></th>}
              {showInterviewRatings && <th className="text-left px-4 py-3"><SortHeader label="Interview" field="interviewRating" /></th>}
              <th className="text-left px-4 py-3"><SortHeader label="Date" field="date" /></th>
            </tr>
          </thead>
          <tbody>
            {!groupByUser && applications.map(app => {
              const teamColor = TEAM_DOT_COLORS[app.team] || 'var(--lhr-blue)';
              const isChecked = selectedIds.has(app.id);
              const isSelectionMode = selectedIds.size > 0;
              return (
                <tr key={app.id} className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', backgroundColor: isChecked ? 'rgba(4,95,133,0.06)' : 'transparent' }}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleSelect(app.id);
                    } else {
                      window.location.href = `/admin/applications/${app.id}`;
                    }
                  }}
                  onMouseEnter={e => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                  {canBulkAction && (
                    <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(app.id); }}>
                      {isChecked
                        ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--lhr-blue)' }} />
                        : <Square className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.12)' }} />}
                    </td>
                  )}
                  <td className="px-5 py-3">
                    <div className="font-montserrat text-[13px] font-semibold text-white/80 truncate">{app.user.name || 'Unknown'}</div>
                    <div className="font-urbanist text-[11px] text-white/20 truncate">{app.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
                      <span className="font-urbanist text-[12px] font-semibold" style={{ color: teamColor }}>{app.team}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-urbanist text-[12px] text-white/35 truncate">
                      {app.preferredSystems?.length
                        ? app.preferredSystems.map((sys: string, idx: number) => `${idx + 1}. ${sys}`).join(', ')
                        : 'General'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={getDisplayStatusForUser(app, currentUser)} />
                  </td>
                  <td className="px-4 py-3">
                    {app.otherTeams?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {app.otherTeams.map((t: any, i: number) => {
                          const sc = t.status === 'rejected' ? 'rgba(239,68,68,0.7)' : t.status === 'accepted' ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.4)';
                          return (
                            <span key={i} className="px-2 py-0.5 text-[10px] font-semibold rounded font-urbanist"
                              style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)', color: 'rgba(168,85,247,0.7)' }}
                              onClick={t.id ? (e: React.MouseEvent) => { e.stopPropagation(); window.location.href = `/admin/applications/${t.id}`; } : undefined}>
                              {t.team} <span style={{ color: sc }}>({getStatusLabel(t.status)})</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : <span className="font-urbanist text-[11px] text-white/15">—</span>}
                  </td>
                  {canSeeRatings && (
                    <td className="px-4 py-3">
                      {app.aggregateRating != null ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full flex items-center gap-1 font-urbanist w-fit"
                          style={{
                            backgroundColor: app.aggregateRating >= 4 ? 'rgba(34,197,94,0.08)' : app.aggregateRating >= 3 ? 'rgba(255,181,38,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${app.aggregateRating >= 4 ? 'rgba(34,197,94,0.18)' : app.aggregateRating >= 3 ? 'rgba(255,181,38,0.18)' : 'rgba(239,68,68,0.18)'}`,
                            color: app.aggregateRating >= 4 ? 'rgba(34,197,94,0.8)' : app.aggregateRating >= 3 ? 'rgba(255,181,38,0.7)' : 'rgba(239,68,68,0.8)',
                          }}>
                          <Star className="h-3 w-3" />{app.aggregateRating.toFixed(1)}
                        </span>
                      ) : <span className="font-urbanist text-[11px] text-white/15">—</span>}
                    </td>
                  )}
                  {showInterviewRatings && (
                    <td className="px-4 py-3">
                      {app.interviewAggregateRating != null ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full flex items-center gap-1 font-urbanist w-fit"
                          style={{
                            backgroundColor: app.interviewAggregateRating >= 4 ? 'rgba(34,197,94,0.08)' : app.interviewAggregateRating >= 3 ? 'rgba(4,95,133,0.1)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${app.interviewAggregateRating >= 4 ? 'rgba(34,197,94,0.18)' : app.interviewAggregateRating >= 3 ? 'rgba(4,95,133,0.2)' : 'rgba(239,68,68,0.18)'}`,
                            color: app.interviewAggregateRating >= 4 ? 'rgba(34,197,94,0.8)' : app.interviewAggregateRating >= 3 ? 'var(--lhr-blue)' : 'rgba(239,68,68,0.8)',
                          }}>
                          <MessageSquare className="h-3 w-3" />{app.interviewAggregateRating.toFixed(1)}
                        </span>
                      ) : <span className="font-urbanist text-[11px] text-white/15">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="font-urbanist text-[12px] text-white/25">{format(new Date(app.createdAt), 'MMM d, yyyy')}</span>
                  </td>
                </tr>
              );
            })}

            {groupByUser && groupedApplications.map(group => {
              const isExpanded = expandedUsers.has(group.userId);
              return (
                <Fragment key={group.userId}>
                  {/* Primary Row */}
                  <tr className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', backgroundColor: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                    onClick={() => toggleExpandUser(group.userId)}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    {canBulkAction && <td className="px-3 py-3"></td>}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                        <div>
                          <div className="font-montserrat text-[13px] font-semibold text-white truncate">{group.user.name || 'Unknown'}</div>
                          <div className="font-urbanist text-[11px] text-white/30 truncate">{group.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" colSpan={3}>
                      <div className="flex flex-wrap gap-1.5">
                        {group.allTeams.map((t, i) => {
                          const tc = TEAM_DOT_COLORS[t.team] || 'var(--lhr-blue)';
                          return (
                            <span key={i} className="px-2 py-0.5 text-[10px] font-semibold rounded font-urbanist flex items-center gap-1"
                              style={{ backgroundColor: `color-mix(in srgb, ${tc} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${tc} 20%, transparent)`, color: tc }}
                              onClick={t.id ? (e) => { e.stopPropagation(); window.location.href = `/admin/applications/${t.id}`; } : undefined}>
                              {t.team} <span className="text-white/40 font-normal">({getStatusLabel(t.status)})</span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="text-[11px] text-white/30">{group.apps.length} visible application{group.apps.length > 1 ? 's' : ''}</span></td>
                    {canSeeRatings && <td className="px-4 py-3"></td>}
                    {showInterviewRatings && <td className="px-4 py-3"></td>}
                    <td className="px-4 py-3"></td>
                  </tr>

                  {/* Sub Rows */}
                  {isExpanded && group.apps.map(app => {
                    const teamColor = TEAM_DOT_COLORS[app.team] || 'var(--lhr-blue)';
                    const isChecked = selectedIds.has(app.id);
                    const isSelectionMode = selectedIds.size > 0;
                    return (
                      <tr key={app.id} className="transition-colors cursor-pointer"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.01)', backgroundColor: isChecked ? 'rgba(4,95,133,0.06)' : 'rgba(0,0,0,0.2)' }}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelect(app.id);
                          } else {
                            window.location.href = `/admin/applications/${app.id}`;
                          }
                        }}
                        onMouseEnter={e => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={e => { if (!isChecked) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'; }}>
                        {canBulkAction && (
                          <td className="px-3 py-2 pl-6" onClick={e => { e.stopPropagation(); toggleSelect(app.id); }}>
                            {isChecked
                              ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--lhr-blue)' }} />
                              : <Square className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.12)' }} />}
                          </td>
                        )}
                        <td className="px-5 py-2 pl-12">
                          <span className="text-[11px] font-urbanist text-white/30">Application ID: {app.id.slice(0, 8)}...</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
                            <span className="font-urbanist text-[11px] font-semibold" style={{ color: teamColor }}>{app.team}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-urbanist text-[11px] text-white/35 truncate">
                            {app.preferredSystems?.length
                              ? app.preferredSystems.map((sys: string, idx: number) => `${idx + 1}. ${sys}`).join(', ')
                              : 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={getDisplayStatusForUser(app, currentUser)} />
                        </td>
                        <td className="px-4 py-2"></td>
                        {canSeeRatings && (
                          <td className="px-4 py-2">
                            {app.aggregateRating != null ? (
                              <span className="text-[11px] font-semibold flex items-center gap-1 font-urbanist text-white/50">
                                <Star className="h-3 w-3" />{app.aggregateRating.toFixed(1)}
                              </span>
                            ) : <span className="font-urbanist text-[11px] text-white/15">—</span>}
                          </td>
                        )}
                        {showInterviewRatings && (
                          <td className="px-4 py-2">
                            {app.interviewAggregateRating != null ? (
                              <span className="text-[11px] font-semibold flex items-center gap-1 font-urbanist text-white/50">
                                <MessageSquare className="h-3 w-3" />{app.interviewAggregateRating.toFixed(1)}
                              </span>
                            ) : <span className="font-urbanist text-[11px] text-white/15">—</span>}
                          </td>
                        )}
                        <td className="px-4 py-2">
                          <span className="font-urbanist text-[11px] text-white/25">{format(new Date(app.createdAt), 'MMM d')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {applications.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <p className="font-urbanist text-[14px] text-white/25">No applicants found.</p>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {canBulkAction && selectedIds.size > 0 && (
        <div className="shrink-0 px-6 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(4,95,133,0.08)', borderTop: '1px solid rgba(4,95,133,0.2)' }}>
          <span className="font-urbanist text-[13px] font-semibold" style={{ color: 'var(--lhr-blue)' }}>
            {selectedIds.size} selected
          </span>
          {confirmAction ? (
            <div className="flex items-center gap-2">
              <span className="font-urbanist text-[12px] text-white/50">
                {confirmAction.charAt(0).toUpperCase() + confirmAction.slice(1)} {selectedIds.size} applicant{selectedIds.size > 1 ? 's' : ''}?
              </span>
              <button onClick={() => handleBulkAction(confirmAction)} disabled={bulkProcessing}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist flex items-center gap-1.5"
                style={actionBtnStyle('rgba(34,197,94,1)', false)}>
                {bulkProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Confirm
              </button>
              <button onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist"
                style={actionBtnStyle('rgba(255,255,255,0.5)', false)}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button disabled={!canReject} title={!canReject ? "Not allowed in current recruiting step" : ""} onClick={() => setConfirmAction('reject')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canReject && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('#ef4444', !canReject)}>Reject</button>
              <button disabled={!canAcceptWaitlist} title={!canAcceptWaitlist ? "Waitlisting requires Trial phase" : ""} onClick={() => setConfirmAction('waitlist')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canAcceptWaitlist && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('#ff9404', !canAcceptWaitlist)}>Waitlist</button>
              <button disabled={!canInterview} title={!canInterview ? "Not allowed in current recruiting step" : ""} onClick={() => setConfirmAction('interview')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canInterview && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('#06b6d4', !canInterview)}>Interview</button>
              <button disabled={!canTrial} title={!canTrial ? "Trial phase hasn't started" : ""} onClick={() => setConfirmAction('trial')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canTrial && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('#a855f7', !canTrial)}>Trial</button>
              <button disabled={!canAcceptWaitlist} title={!canAcceptWaitlist ? "Accepting requires Trial phase" : ""} onClick={() => setConfirmAction('accept')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canAcceptWaitlist && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('#22c55e', !canAcceptWaitlist)}>Accept</button>
              <button disabled={!canRevert} title={!canRevert ? "Not allowed in current recruiting step" : ""} onClick={() => setConfirmAction('submitted')} className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md font-urbanist", !canRevert && "opacity-50 cursor-not-allowed")} style={actionBtnStyle('rgba(255,255,255,0.7)', !canRevert)}>Revert to Submitted</button>
            </div>
          )}
        </div>
      )}

      {/* Result toast */}
      {bulkResult && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg font-urbanist text-[12px] font-semibold flex items-center gap-2"
          style={{ backgroundColor: bulkResult.failed === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${bulkResult.failed === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: bulkResult.failed === 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)' }}>
          {bulkResult.failed === 0
            ? <><Check className="h-3.5 w-3.5" /> {bulkResult.success} updated successfully</>
            : <><AlertCircle className="h-3.5 w-3.5" /> {bulkResult.success} succeeded, {bulkResult.failed} failed</>}
        </div>
      )}
    </div>
  );
}
