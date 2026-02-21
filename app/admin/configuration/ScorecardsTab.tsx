"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ScorecardConfig, ScorecardFieldConfig, ScorecardFieldType, ScorecardType } from "@/lib/models/Scorecard";
import { Team } from "@/lib/models/User";
import { TEAM_SYSTEMS } from "@/lib/models/teamQuestions";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Settings2,
  ClipboardList,
  MessagesSquare,
  Loader2,
} from "lucide-react";

const FIELD_TYPES: { value: ScorecardFieldType; label: string }[] = [
  { value: "rating", label: "Rating (1-5)" },
  { value: "boolean", label: "Yes/No" },
  { value: "text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
];

const teamColors: Record<string, { dot: string; text: string }> = {
  [Team.ELECTRIC]: { dot: "var(--lhr-blue)", text: "var(--lhr-blue-light)" },
  [Team.SOLAR]: { dot: "var(--lhr-gold)", text: "var(--lhr-gold)" },
  [Team.COMBUSTION]: { dot: "var(--lhr-orange)", text: "var(--lhr-orange)" },
};

const optionStyle = { backgroundColor: "#0c1218", color: "white" };

interface EditingField extends ScorecardFieldConfig {
  isNew?: boolean;
}

export function ScorecardsTab() {
  const [configs, setConfigs] = useState<ScorecardConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<ScorecardType>("application");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newConfigTeam, setNewConfigTeam] = useState<Team>(Team.ELECTRIC);
  const [newConfigSystem, setNewConfigSystem] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, [selectedType]);

  useEffect(() => {
    const systems = TEAM_SYSTEMS[newConfigTeam];
    if (systems && systems.length > 0) {
      setNewConfigSystem(systems[0].value);
    }
  }, [newConfigTeam]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/scorecards?type=${selectedType}`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (err) {
      console.error("Failed to fetch configs", err);
      toast.error("Failed to load scorecard configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConfig = async () => {
    if (!newConfigTeam || !newConfigSystem) {
      toast.error("Please select a team and system");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/scorecards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: newConfigTeam,
          system: newConfigSystem,
          scorecardType: selectedType,
          fields: [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => [...prev, data.config]);
        setShowCreateModal(false);
        setExpandedConfig(data.config.id);
        toast.success(`${selectedType === "interview" ? "Interview scorecard" : "Scorecard"} configuration created!`);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create configuration");
      }
    } catch (err) {
      console.error("Failed to create config", err);
      toast.error("Failed to create configuration");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm("Are you sure you want to delete this scorecard configuration?")) return;

    try {
      const res = await fetch(`/api/admin/scorecards/${configId}`, { method: "DELETE" });
      if (res.ok) {
        setConfigs(prev => prev.filter(c => c.id !== configId));
        toast.success("Configuration deleted");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete");
      }
    } catch (err) {
      console.error("Failed to delete config", err);
      toast.error("Failed to delete configuration");
    }
  };

  const handleSaveFields = async (configId: string, fields: ScorecardFieldConfig[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/scorecards/${configId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => prev.map(c => c.id === configId ? data.config : c));
        toast.success("Fields saved!");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save");
      }
    } catch (err) {
      console.error("Failed to save fields", err);
      toast.error("Failed to save fields");
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = (configId: string) => {
    setEditingConfigId(configId);
    setEditingField({
      id: `field_${Date.now()}`,
      label: "",
      type: "rating",
      min: 1,
      max: 5,
      required: true,
      isNew: true,
    });
  };

  const handleEditField = (configId: string, field: ScorecardFieldConfig) => {
    setEditingConfigId(configId);
    setEditingField({ ...field });
  };

  const handleSaveField = () => {
    if (!editingField || !editingConfigId) return;
    const config = configs.find(c => c.id === editingConfigId);
    if (!config) return;

    let newFields: ScorecardFieldConfig[];
    if (editingField.isNew) {
      const { isNew, ...fieldData } = editingField;
      newFields = [...config.fields, fieldData];
    } else {
      const { isNew, ...fieldData } = editingField;
      newFields = config.fields.map(f => f.id === fieldData.id ? fieldData : f);
    }

    handleSaveFields(editingConfigId, newFields);
    setEditingField(null);
    setEditingConfigId(null);
  };

  const handleDeleteField = (configId: string, fieldId: string) => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    const newFields = config.fields.filter(f => f.id !== fieldId);
    handleSaveFields(configId, newFields);
  };

  const handleMoveField = (configId: string, fieldId: string, direction: 'up' | 'down') => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;
    const fieldIndex = config.fields.findIndex(f => f.id === fieldId);
    if (fieldIndex === -1) return;
    const newIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
    if (newIndex < 0 || newIndex >= config.fields.length) return;
    const newFields = [...config.fields];
    [newFields[fieldIndex], newFields[newIndex]] = [newFields[newIndex], newFields[fieldIndex]];
    handleSaveFields(configId, newFields);
  };

  const configsByTeam = configs.reduce((acc, config) => {
    if (!acc[config.team]) acc[config.team] = [];
    acc[config.team].push(config);
    return acc;
  }, {} as Record<Team, ScorecardConfig[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--lhr-blue)" }} />
          <span className="font-urbanist text-[13px] text-white/30">Loading scorecard configurations...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Type Toggle */}
      <div className="flex items-center gap-2 mb-6 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <button
          onClick={() => setSelectedType("application")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200"
          style={{
            backgroundColor: selectedType === "application" ? "rgba(255,181,38,0.10)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${selectedType === "application" ? "rgba(255,181,38,0.20)" : "rgba(255,255,255,0.06)"}`,
            color: selectedType === "application" ? "var(--lhr-gold)" : "rgba(255,255,255,0.35)",
          }}
        >
          <ClipboardList className="h-4 w-4" />
          Application Scorecards
        </button>
        <button
          onClick={() => setSelectedType("interview")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200"
          style={{
            backgroundColor: selectedType === "interview" ? "rgba(4,95,133,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${selectedType === "interview" ? "rgba(4,95,133,0.25)" : "rgba(255,255,255,0.06)"}`,
            color: selectedType === "interview" ? "var(--lhr-blue-light)" : "rgba(255,255,255,0.35)",
          }}
        >
          <MessagesSquare className="h-4 w-4" />
          Interview Scorecards
        </button>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-montserrat text-[22px] font-bold text-white mb-1.5">
            {selectedType === "interview" ? "Interview Scorecard" : "Application Scorecard"} Configurations
          </h2>
          <p className="font-urbanist text-[14px] text-white/35">
            {selectedType === "interview"
              ? "Define evaluation criteria for interviews."
              : "Define evaluation criteria for application reviews."}
          </p>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: "rgba(255,181,38,0.06)", border: "1px solid rgba(255,181,38,0.12)", color: "rgba(255,181,38,0.6)" }}
          >
            Changes may take up to 5 minutes to appear for reviewers due to caching.
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors duration-200"
          style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#056fa0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--lhr-blue)"; }}
        >
          <Plus className="h-4 w-4" />
          New Configuration
        </button>
      </div>

      {/* Configs grouped by team */}
      {Object.values(Team).map(team => {
        const teamConfigs = configsByTeam[team] || [];
        const tc = teamColors[team] || { dot: "var(--lhr-gold)", text: "var(--lhr-gold)" };

        return (
          <div key={team} className="mb-8">
            <h3 className="font-montserrat text-[16px] font-bold mb-4 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tc.dot }} />
              <span style={{ color: tc.text }}>{team} Team</span>
              <span className="text-[12px] font-normal text-white/25 ml-1">
                ({teamConfigs.length} configuration{teamConfigs.length !== 1 ? 's' : ''})
              </span>
            </h3>

            {teamConfigs.length === 0 ? (
              <div
                className="p-6 rounded-xl text-center font-urbanist text-[14px] text-white/25"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                No configurations for this team yet.
              </div>
            ) : (
              <div className="space-y-4">
                {teamConfigs.map(config => (
                  <div
                    key={config.id}
                    className="rounded-xl overflow-hidden"
                    style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {/* Config Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer transition-colors duration-150"
                      onClick={() => setExpandedConfig(expandedConfig === config.id ? null : config.id!)}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <div className="flex items-center gap-3">
                        <Settings2 className="h-4 w-4 text-white/20" />
                        <div>
                          <h3 className="text-[14px] font-semibold text-white/80">{config.system}</h3>
                          <p className="text-[11px] text-white/25">
                            {config.fields.length} field{config.fields.length !== 1 ? 's' : ''} configured
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteConfig(config.id!); }}
                          className="p-2 transition-colors duration-150"
                          style={{ color: "rgba(255,255,255,0.15)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {expandedConfig === config.id
                          ? <ChevronUp className="h-4 w-4 text-white/20" />
                          : <ChevronDown className="h-4 w-4 text-white/20" />
                        }
                      </div>
                    </div>

                    {/* Expanded Fields */}
                    {expandedConfig === config.id && (
                      <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        {config.fields.length === 0 ? (
                          <p className="font-urbanist text-[13px] text-white/25 text-center py-4">
                            No fields configured. Add your first field to get started.
                          </p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {config.fields.map((field, index) => (
                              <div
                                key={field.id}
                                className="flex items-center gap-3 p-3 rounded-lg group"
                                style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                              >
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => handleMoveField(config.id!, field.id, 'up')}
                                    disabled={index === 0}
                                    className="text-white/15 hover:text-white/50 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveField(config.id!, field.id, 'down')}
                                    disabled={index === config.fields.length - 1}
                                    className="text-white/15 hover:text-white/50 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-medium text-white/80">{field.label}</span>
                                    {field.required && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#ef4444" }}>Required</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span
                                      className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded"
                                      style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}
                                    >
                                      {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                                    </span>
                                    {field.type === "rating" && field.weight !== undefined && (
                                      <span className="text-[11px] text-white/25">Weight: {field.weight}</span>
                                    )}
                                    {field.description && (
                                      <span className="text-[11px] text-white/20 truncate max-w-xs">{field.description}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleEditField(config.id!, field)}
                                    className="p-2 text-white/20 hover:text-white/60 transition-colors"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteField(config.id!, field.id)}
                                    className="p-2 text-white/20 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={() => handleAddField(config.id!)}
                          className="flex items-center gap-2 text-[13px] font-medium transition-colors"
                          style={{ color: "var(--lhr-blue-light)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--lhr-blue)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--lhr-blue-light)"; }}
                        >
                          <Plus className="h-4 w-4" />
                          Add Field
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Create Config Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-full max-w-md rounded-xl overflow-hidden animate-fadeSlideUp"
            style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
          >
            <div className="flex items-center gap-0.5 px-6 pt-5">
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold-light)" }} />
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold)" }} />
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-orange)" }} />
            </div>
            <div className="px-6 pt-4 pb-6 space-y-5">
              <div>
                <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "var(--lhr-gray-blue)" }}>
                  New Configuration
                </p>
                <h3 className="font-montserrat text-[18px] font-bold text-white">
                  New {selectedType === "interview" ? "Interview " : ""}Scorecard Configuration
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Team</label>
                  <div className="relative">
                    <select
                      value={newConfigTeam}
                      onChange={(e) => setNewConfigTeam(e.target.value as Team)}
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {Object.values(Team).map(team => (
                        <option key={team} value={team} style={optionStyle}>{team}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/20" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>System</label>
                  <div className="relative">
                    <select
                      value={newConfigSystem}
                      onChange={(e) => setNewConfigSystem(e.target.value)}
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {TEAM_SYSTEMS[newConfigTeam]?.map(sys => (
                        <option key={sys.value} value={sys.value} style={optionStyle}>{sys.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/20" />
                  </div>
                </div>

                {selectedType === "interview" && (
                  <div
                    className="p-3 rounded-lg text-[12px] font-urbanist"
                    style={{ backgroundColor: "rgba(4,95,133,0.08)", border: "1px solid rgba(4,95,133,0.15)", color: "var(--lhr-blue-light)" }}
                  >
                    Interview scorecards are only visible after interview invites have been released.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium"
                  style={{ color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  Cancel
                </button>
                <button
                  disabled={creating}
                  onClick={handleCreateConfig}
                  className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Field Modal */}
      {editingField && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-full max-w-lg rounded-xl overflow-hidden animate-fadeSlideUp"
            style={{ backgroundColor: "rgba(8,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
          >
            <div className="flex items-center gap-0.5 px-6 pt-5">
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold-light)" }} />
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-gold)" }} />
              <div className="h-[3px] w-5 rounded-full" style={{ backgroundColor: "var(--lhr-orange)" }} />
            </div>
            <div className="px-6 pt-4 pb-6 space-y-5">
              <div>
                <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "var(--lhr-gray-blue)" }}>
                  {editingField.isNew ? "Add Field" : "Edit Field"}
                </p>
                <h3 className="font-montserrat text-[18px] font-bold text-white">
                  Scorecard Field
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>
                    Label <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editingField.label}
                    onChange={(e) => setEditingField({ ...editingField, label: e.target.value })}
                    placeholder="e.g., Technical Knowledge"
                    className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Type</label>
                  <div className="relative">
                    <select
                      value={editingField.type}
                      onChange={(e) => setEditingField({
                        ...editingField,
                        type: e.target.value as ScorecardFieldType,
                        min: e.target.value === "rating" ? 1 : undefined,
                        max: e.target.value === "rating" ? 5 : undefined,
                        weight: e.target.value === "rating" ? editingField.weight : undefined,
                      })}
                      className="w-full h-10 rounded-lg px-3 pr-9 text-[13px] font-urbanist text-white appearance-none focus:outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {FIELD_TYPES.map(type => (
                        <option key={type.value} value={type.value} style={optionStyle}>{type.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-white/20" />
                  </div>
                </div>

                {editingField.type === "rating" && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Min</label>
                      <input
                        type="number"
                        value={editingField.min || 1}
                        onChange={(e) => setEditingField({ ...editingField, min: parseInt(e.target.value) })}
                        className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Max</label>
                      <input
                        type="number"
                        value={editingField.max || 5}
                        onChange={(e) => setEditingField({ ...editingField, max: parseInt(e.target.value) })}
                        className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Weight</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editingField.weight || ""}
                        onChange={(e) => setEditingField({
                          ...editingField,
                          weight: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                        placeholder="1.0"
                        className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--lhr-gray-blue)" }}>Description</label>
                  <input
                    type="text"
                    value={editingField.description || ""}
                    onChange={(e) => setEditingField({ ...editingField, description: e.target.value })}
                    placeholder="Helper text shown to reviewers"
                    className="w-full h-10 rounded-lg px-3 text-[13px] font-urbanist text-white placeholder:text-white/20 focus:outline-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    className="w-7 h-4 rounded-full relative transition-colors duration-200 cursor-pointer"
                    style={{ backgroundColor: editingField.required ? "var(--lhr-blue)" : "rgba(255,255,255,0.10)" }}
                    onClick={() => setEditingField({ ...editingField, required: !editingField.required })}
                  >
                    <div
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200"
                      style={{ left: editingField.required ? "14px" : "2px" }}
                    />
                  </div>
                  <span className="font-urbanist text-[13px] text-white/50">Required field</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button
                  onClick={() => { setEditingField(null); setEditingConfigId(null); }}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium"
                  style={{ color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  Cancel
                </button>
                <button
                  disabled={!editingField.label || saving}
                  onClick={handleSaveField}
                  className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: "var(--lhr-blue)", color: "white" }}
                >
                  {saving ? "Saving..." : "Save Field"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
