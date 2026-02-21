"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { TeamsConfig, TeamDescription, SubsystemDescription } from "@/lib/models/Config";
import { Team, UserRole, User } from "@/lib/models/User";
import { Save, Edit2, X, ChevronDown, ChevronUp, Users, MessageSquare, Loader2, Clock } from "lucide-react";

interface TeamsTabProps {
  userData: User;
}

const teamColors: Record<string, { dot: string; text: string }> = {
  [Team.ELECTRIC]: { dot: "var(--lhr-blue)", text: "var(--lhr-blue-light)" },
  [Team.SOLAR]: { dot: "var(--lhr-gold)", text: "var(--lhr-gold)" },
  [Team.COMBUSTION]: { dot: "var(--lhr-orange)", text: "var(--lhr-orange)" },
};

export function TeamsTab({ userData }: TeamsTabProps) {
  const [config, setConfig] = useState<TeamsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const [editingTeamDesc, setEditingTeamDesc] = useState<string | null>(null);
  const [editingSubsystem, setEditingSubsystem] = useState<{ team: string; subsystem: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingRejectionMsg, setEditingRejectionMsg] = useState<string | null>(null);
  const [rejectionMsgValue, setRejectionMsgValue] = useState("");

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
        body: JSON.stringify({ scope: "team", team, description: editValue }),
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
        body: JSON.stringify({ scope: "subsystem", team, subsystem, description: editValue }),
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
        body: JSON.stringify({ scope: "rejectionMessage", team, rejectionMessage: rejectionMsgValue }),
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
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[13px] text-white/30">Loading teams configuration...</span>
        </div>
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
          <h2 className="font-montserrat text-[22px] font-bold text-white mb-1.5">Team Descriptions</h2>
          <p className="font-urbanist text-[14px] text-white/35">
            Manage team and subsystem descriptions shown on the About page.
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: "rgba(255,181,38,0.06)", border: "1px solid rgba(255,181,38,0.12)", color: "rgba(255,181,38,0.6)" }}
          >
            <Clock className="h-3 w-3" />
            Changes may take up to 15 minutes to appear on the public About page due to caching.
          </div>
        </div>
      </div>

      {sortedTeams.length === 0 ? (
        <div
          className="p-6 rounded-xl text-center font-urbanist text-[14px] text-white/25"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          No team configurations found.
        </div>
      ) : (
        <div className="space-y-6">
          {sortedTeams.map((team) => {
            const isExpanded = expandedTeam === team.name;
            const teamCanEdit = canEditTeam(team.name);
            const tc = teamColors[team.name] || { dot: "var(--lhr-gold)", text: "var(--lhr-gold)" };

            return (
              <div
                key={team.name}
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {/* Team Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer transition-colors duration-150"
                  onClick={() => setExpandedTeam(isExpanded ? null : team.name)}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tc.dot }} />
                    <div>
                      <h3 className="font-montserrat text-[15px] font-bold" style={{ color: tc.text }}>
                        {team.name} Team
                      </h3>
                      <p className="text-[11px] text-white/25">
                        {team.subsystems.length} subsystem{team.subsystems.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-white/20" />
                    : <ChevronDown className="h-4 w-4 text-white/20" />
                  }
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Team Description */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--lhr-gray-blue)" }}>
                          Team Description
                        </h4>
                        {teamCanEdit && editingTeamDesc !== team.name && (
                          <button
                            onClick={() => handleEditTeamDescription(team.name, team.description)}
                            className="flex items-center gap-1 text-[12px] font-medium transition-colors"
                            style={{ color: "var(--lhr-blue-light)" }}
                          >
                            <Edit2 className="h-3 w-3" /> Edit
                          </button>
                        )}
                      </div>

                      {editingTeamDesc === team.name ? (
                        <div className="space-y-3">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={4}
                            className="w-full rounded-lg px-4 py-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none resize-none"
                            style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                            placeholder="Enter team description..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTeamDescription(team.name)}
                              disabled={saving}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                              style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                            >
                              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium"
                              style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                              <X className="h-4 w-4" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="font-urbanist text-[13px] text-white/50 p-3 rounded-lg"
                          style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                        >
                          {team.description}
                        </p>
                      )}
                    </div>

                    {/* Rejection Message */}
                    {teamCanEdit && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                            <MessageSquare className="h-3.5 w-3.5" />
                            Rejection Message
                          </h4>
                          {editingRejectionMsg !== team.name && (
                            <button
                              onClick={() => handleEditRejectionMessage(team.name, (team as any).rejectionMessage || "")}
                              className="flex items-center gap-1 text-[12px] font-medium transition-colors"
                              style={{ color: "var(--lhr-blue-light)" }}
                            >
                              <Edit2 className="h-3 w-3" /> Edit
                            </button>
                          )}
                        </div>
                        <p className="font-urbanist text-[11px] text-white/20 mb-2">
                          This message is shown to applicants who are rejected from this team.
                        </p>

                        {editingRejectionMsg === team.name ? (
                          <div className="space-y-3">
                            <textarea
                              value={rejectionMsgValue}
                              onChange={(e) => setRejectionMsgValue(e.target.value)}
                              rows={4}
                              className="w-full rounded-lg px-4 py-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none resize-none"
                              style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                              placeholder="Thank you for your interest in our team. Unfortunately, we were not able to move forward with your application at this time..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveRejectionMessage(team.name)}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                                style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                              >
                                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium"
                                style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
                              >
                                <X className="h-4 w-4" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className="font-urbanist text-[13px] text-white/35 italic p-3 rounded-lg"
                            style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                          >
                            {(team as any).rejectionMessage || "No custom rejection message set. Default message will be shown."}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Subsystems */}
                    <div>
                      <h4 className="text-[11px] font-semibold tracking-widest uppercase mb-3 flex items-center gap-1.5" style={{ color: "var(--lhr-gray-blue)" }}>
                        <Users className="h-3.5 w-3.5" />
                        Subsystems
                      </h4>
                      <div className="space-y-3">
                        {team.subsystems.map((subsystem) => {
                          const subsystemCanEdit = canEditSubsystem(team.name, subsystem.name);
                          const isEditing = editingSubsystem?.team === team.name && editingSubsystem?.subsystem === subsystem.name;

                          return (
                            <div
                              key={subsystem.name}
                              className="p-4 rounded-lg"
                              style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-montserrat text-[13px] font-semibold text-white/80">{subsystem.name}</h5>
                                {subsystemCanEdit && !isEditing && (
                                  <button
                                    onClick={() => handleEditSubsystemDescription(team.name, subsystem.name, subsystem.description)}
                                    className="flex items-center gap-1 text-[12px] font-medium transition-colors"
                                    style={{ color: "var(--lhr-blue-light)" }}
                                  >
                                    <Edit2 className="h-3 w-3" /> Edit
                                  </button>
                                )}
                              </div>

                              {isEditing ? (
                                <div className="space-y-3">
                                  <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg px-4 py-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none resize-none"
                                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                                    placeholder="Enter subsystem description..."
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleSaveSubsystemDescription(team.name, subsystem.name)}
                                      disabled={saving}
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                                      style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                                    >
                                      <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium"
                                      style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
                                    >
                                      <X className="h-3 w-3" /> Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="font-urbanist text-[13px] text-white/35">
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
