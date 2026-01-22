"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { TeamsConfig, TeamDescription, SubsystemDescription } from "@/lib/models/Config";
import { Team, UserRole, User } from "@/lib/models/User";
import { Save, Edit2, X, ChevronDown, ChevronUp, Users, MessageSquare } from "lucide-react";
import clsx from "clsx";

interface TeamsTabProps {
  userData: User;
}

export function TeamsTab({ userData }: TeamsTabProps) {
  const [config, setConfig] = useState<TeamsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  
  // Edit states
  const [editingTeamDesc, setEditingTeamDesc] = useState<string | null>(null);
  const [editingSubsystem, setEditingSubsystem] = useState<{ team: string; subsystem: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Rejection message state
  const [editingRejectionMsg, setEditingRejectionMsg] = useState<string | null>(null);
  const [rejectionMsgValue, setRejectionMsgValue] = useState("");

  // Permissions
  const isAdmin = userData.role === UserRole.ADMIN;
  const isTeamCaptain = userData.role === UserRole.TEAM_CAPTAIN_OB;
  const isSystemLead = userData.role === UserRole.SYSTEM_LEAD;
  const userTeam = userData.memberProfile?.team;
  const userSystem = userData.memberProfile?.system;

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config/teams");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Failed to fetch teams config", err);
      toast.error("Failed to load teams configuration");
    } finally {
      setLoading(false);
    }
  };

  const canEditTeam = (team: string) => {
    if (isAdmin) return true;
    if (isTeamCaptain && team === userTeam) return true;
    return false;
  };

  const canEditSubsystem = (team: string, subsystem: string) => {
    if (isAdmin) return true;
    if (isSystemLead && team === userTeam && subsystem === userSystem) return true;
    return false;
  };

  const handleEditTeamDescription = (team: string, currentDesc: string) => {
    setEditingTeamDesc(team);
    setEditValue(currentDesc);
    setEditingSubsystem(null);
  };

  const handleEditSubsystemDescription = (team: string, subsystem: string, currentDesc: string) => {
    setEditingSubsystem({ team, subsystem });
    setEditValue(currentDesc);
    setEditingTeamDesc(null);
  };

  const handleSaveTeamDescription = async (team: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "team",
          team,
          description: editValue,
        }),
      });

      if (res.ok) {
        toast.success("Team description updated!");
        setEditingTeamDesc(null);
        fetchConfig();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save team description", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubsystemDescription = async (team: string, subsystem: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "subsystem",
          team,
          subsystem,
          description: editValue,
        }),
      });

      if (res.ok) {
        toast.success("Subsystem description updated!");
        setEditingSubsystem(null);
        fetchConfig();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save subsystem description", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingTeamDesc(null);
    setEditingSubsystem(null);
    setEditingRejectionMsg(null);
    setEditValue("");
    setRejectionMsgValue("");
  };

  const handleEditRejectionMessage = (team: string, currentMsg: string) => {
    setEditingRejectionMsg(team);
    setRejectionMsgValue(currentMsg || "");
    setEditingTeamDesc(null);
    setEditingSubsystem(null);
  };

  const handleSaveRejectionMessage = async (team: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "rejectionMessage",
          team,
          rejectionMessage: rejectionMsgValue,
        }),
      });

      if (res.ok) {
        toast.success("Rejection message updated!");
        setEditingRejectionMsg(null);
        fetchConfig();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save rejection message", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500 h-full">
        <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mr-3"></div>
        Loading teams configuration...
      </div>
    );
  }

  const teamOrder = [Team.ELECTRIC, Team.SOLAR, Team.COMBUSTION];
  const sortedTeams = config 
    ? teamOrder.filter(t => config.teams[t]).map(t => config.teams[t])
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Team Descriptions</h2>
          <p className="text-neutral-400">
            Manage team and subsystem descriptions shown on the About page.
          </p>
          <p className="text-xs text-amber-500/80 mt-2">
            ⏱ Note: Changes may take up to 15 minutes to appear on the public About page due to caching.
          </p>
        </div>
      </div>

      {/* Teams List */}
      {sortedTeams.length === 0 ? (
        <div className="bg-neutral-900 border border-white/5 rounded-xl p-6 text-center text-neutral-500">
          No team configurations found.
        </div>
      ) : (
        <div className="space-y-6">
          {sortedTeams.map((team) => {
            const isExpanded = expandedTeam === team.name;
            const teamCanEdit = canEditTeam(team.name);
            
            return (
              <div 
                key={team.name}
                className="bg-neutral-900 border border-white/5 rounded-xl overflow-hidden"
              >
                {/* Team Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedTeam(isExpanded ? null : team.name)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {team.name === Team.ELECTRIC && "⚡"}
                      {team.name === Team.SOLAR && "☀️"}
                      {team.name === Team.COMBUSTION && "🔥"}
                    </span>
                    <div>
                      <h3 className={clsx(
                        "text-lg font-bold",
                        team.name === Team.ELECTRIC && "text-yellow-400",
                        team.name === Team.SOLAR && "text-blue-400",
                        team.name === Team.COMBUSTION && "text-red-400"
                      )}>
                        {team.name} Team
                      </h3>
                      <p className="text-xs text-neutral-500">
                        {team.subsystems.length} subsystem{team.subsystems.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-neutral-500" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-4">
                    {/* Team Description */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-neutral-400">Team Description</h4>
                        {teamCanEdit && editingTeamDesc !== team.name && (
                          <button
                            onClick={() => handleEditTeamDescription(team.name, team.description)}
                            className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                      </div>
                      
                      {editingTeamDesc === team.name ? (
                        <div className="space-y-3">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={4}
                            className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 resize-none"
                            placeholder="Enter team description..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTeamDescription(team.name)}
                              disabled={saving}
                              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg text-sm font-medium hover:bg-neutral-700"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-neutral-300 bg-neutral-800/50 p-3 rounded-lg">
                          {team.description}
                        </p>
                      )}
                    </div>

                    {/* Rejection Message - only show to those who can edit team */}
                    {teamCanEdit && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-neutral-400 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Rejection Message
                          </h4>
                          {editingRejectionMsg !== team.name && (
                            <button
                              onClick={() => handleEditRejectionMessage(team.name, (team as any).rejectionMessage || "")}
                              className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
                            >
                              <Edit2 className="h-3 w-3" />
                              Edit
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mb-2">
                          This message is shown to applicants who are rejected from this team.
                        </p>
                        
                        {editingRejectionMsg === team.name ? (
                          <div className="space-y-3">
                            <textarea
                              value={rejectionMsgValue}
                              onChange={(e) => setRejectionMsgValue(e.target.value)}
                              rows={4}
                              className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 resize-none"
                              placeholder="Thank you for your interest in our team. Unfortunately, we were not able to move forward with your application at this time..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveRejectionMessage(team.name)}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-50"
                              >
                                <Save className="h-4 w-4" />
                                {saving ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg text-sm font-medium hover:bg-neutral-700"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-neutral-300 bg-neutral-800/50 p-3 rounded-lg text-sm italic">
                            {(team as any).rejectionMessage || "No custom rejection message set. Default message will be shown."}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Subsystems */}
                    <div>
                      <h4 className="text-sm font-medium text-neutral-400 mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Subsystems
                      </h4>
                      <div className="space-y-3">
                        {team.subsystems.map((subsystem) => {
                          const subsystemCanEdit = canEditSubsystem(team.name, subsystem.name);
                          const isEditing = editingSubsystem?.team === team.name && editingSubsystem?.subsystem === subsystem.name;
                          
                          return (
                            <div 
                              key={subsystem.name}
                              className="bg-neutral-800/50 p-4 rounded-lg"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-white">{subsystem.name}</h5>
                                {subsystemCanEdit && !isEditing && (
                                  <button
                                    onClick={() => handleEditSubsystemDescription(team.name, subsystem.name, subsystem.description)}
                                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                    Edit
                                  </button>
                                )}
                              </div>
                              
                              {isEditing ? (
                                <div className="space-y-3">
                                  <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={3}
                                    className="w-full bg-neutral-700 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 resize-none text-sm"
                                    placeholder="Enter subsystem description..."
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveSubsystemDescription(team.name, subsystem.name)}
                                      disabled={saving}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500 disabled:opacity-50"
                                    >
                                      <Save className="h-3 w-3" />
                                      {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-neutral-700 text-white rounded-lg text-xs font-medium hover:bg-neutral-600"
                                    >
                                      <X className="h-3 w-3" />
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-neutral-400 text-sm">
                                  {subsystem.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
