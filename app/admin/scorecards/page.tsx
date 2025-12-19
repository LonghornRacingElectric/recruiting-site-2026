"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ScorecardConfig, ScorecardFieldConfig, ScorecardFieldType } from "@/lib/models/Scorecard";
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
  GripVertical,
  Settings2
} from "lucide-react";
import clsx from "clsx";

const FIELD_TYPES: { value: ScorecardFieldType; label: string }[] = [
  { value: "rating", label: "Rating (1-5)" },
  { value: "boolean", label: "Yes/No" },
  { value: "text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
];

interface EditingField extends ScorecardFieldConfig {
  isNew?: boolean;
}

export default function AdminScorecardsPage() {
  const [configs, setConfigs] = useState<ScorecardConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);
  
  // Create new config state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newConfigTeam, setNewConfigTeam] = useState<Team>(Team.ELECTRIC);
  const [newConfigSystem, setNewConfigSystem] = useState<string>("");
  const [creating, setCreating] = useState(false);
  
  // Edit field state
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    // Reset system when team changes
    const systems = TEAM_SYSTEMS[newConfigTeam];
    if (systems && systems.length > 0) {
      setNewConfigSystem(systems[0].value);
    }
  }, [newConfigTeam]);

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/admin/scorecards");
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
          fields: [],
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => [...prev, data.config]);
        setShowCreateModal(false);
        setExpandedConfig(data.config.id);
        toast.success("Scorecard configuration created!");
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
    if (!confirm("Are you sure you want to delete this scorecard configuration?")) {
      return;
    }
    
    try {
      const res = await fetch(`/api/admin/scorecards/${configId}`, {
        method: "DELETE",
      });
      
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
      // Add new field
      const { isNew, ...fieldData } = editingField;
      newFields = [...config.fields, fieldData];
    } else {
      // Update existing field
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

  // Group configs by team
  const configsByTeam = configs.reduce((acc, config) => {
    if (!acc[config.team]) {
      acc[config.team] = [];
    }
    acc[config.team].push(config);
    return acc;
  }, {} as Record<Team, ScorecardConfig[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-500 h-full">
        <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full mr-3"></div>
        Loading scorecard configurations...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Scorecard Configurations</h1>
          <p className="text-neutral-400">Define evaluation criteria for each team and system.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Configuration
        </button>
      </div>

      {/* Configs grouped by team */}
      {Object.values(Team).map(team => {
        const teamConfigs = configsByTeam[team] || [];
        
        return (
          <div key={team} className="mb-8">
            <h2 className={clsx(
              "text-xl font-bold mb-4 flex items-center gap-2",
              team === Team.ELECTRIC && "text-yellow-400",
              team === Team.SOLAR && "text-blue-400",
              team === Team.COMBUSTION && "text-red-400"
            )}>
              <span className="text-2xl">
                {team === Team.ELECTRIC && "⚡"}
                {team === Team.SOLAR && "☀️"}
                {team === Team.COMBUSTION && "🔥"}
              </span>
              {team} Team
              <span className="text-sm font-normal text-neutral-500 ml-2">
                ({teamConfigs.length} configuration{teamConfigs.length !== 1 ? 's' : ''})
              </span>
            </h2>
            
            {teamConfigs.length === 0 ? (
              <div className="bg-neutral-900 border border-white/5 rounded-xl p-6 text-center text-neutral-500">
                No configurations for this team yet.
              </div>
            ) : (
              <div className="space-y-4">
                {teamConfigs.map(config => (
                  <div 
                    key={config.id}
                    className="bg-neutral-900 border border-white/5 rounded-xl overflow-hidden"
                  >
                    {/* Config Header */}
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedConfig(expandedConfig === config.id ? null : config.id!)}
                    >
                      <div className="flex items-center gap-3">
                        <Settings2 className="h-5 w-5 text-neutral-500" />
                        <div>
                          <h3 className="text-white font-medium">{config.system}</h3>
                          <p className="text-xs text-neutral-500">
                            {config.fields.length} field{config.fields.length !== 1 ? 's' : ''} configured
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConfig(config.id!);
                          }}
                          className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {expandedConfig === config.id ? (
                          <ChevronUp className="h-5 w-5 text-neutral-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-neutral-500" />
                        )}
                      </div>
                    </div>
                    
                    {/* Expanded Fields */}
                    {expandedConfig === config.id && (
                      <div className="border-t border-white/5 p-4">
                        {config.fields.length === 0 ? (
                          <p className="text-neutral-500 text-sm text-center py-4">
                            No fields configured. Add your first field to get started.
                          </p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {config.fields.map((field, index) => (
                              <div 
                                key={field.id}
                                className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg group"
                              >
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => handleMoveField(config.id!, field.id, 'up')}
                                    disabled={index === 0}
                                    className="text-neutral-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveField(config.id!, field.id, 'down')}
                                    disabled={index === config.fields.length - 1}
                                    className="text-neutral-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium">{field.label}</span>
                                    {field.required && (
                                      <span className="text-xs text-red-400">Required</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-neutral-500 mt-1">
                                    <span className="px-2 py-0.5 bg-neutral-700 rounded">
                                      {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                                    </span>
                                    {field.type === "rating" && field.weight !== undefined && (
                                      <span>Weight: {field.weight}</span>
                                    )}
                                    {field.description && (
                                      <span className="truncate max-w-xs">{field.description}</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleEditField(config.id!, field)}
                                    className="p-2 text-neutral-500 hover:text-white transition-colors"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteField(config.id!, field.id)}
                                    className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <button
                          onClick={() => handleAddField(config.id!)}
                          className="flex items-center gap-2 text-orange-500 text-sm font-medium hover:text-orange-400 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6">New Scorecard Configuration</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Team</label>
                <select
                  value={newConfigTeam}
                  onChange={(e) => setNewConfigTeam(e.target.value as Team)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                >
                  {Object.values(Team).map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">System</label>
                <select
                  value={newConfigSystem}
                  onChange={(e) => setNewConfigSystem(e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                >
                  {TEAM_SYSTEMS[newConfigTeam]?.map(sys => (
                    <option key={sys.value} value={sys.value}>{sys.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                disabled={creating}
                onClick={handleCreateConfig}
                className="flex-1 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-500 transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Field Modal */}
      {editingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingField.isNew ? "Add Field" : "Edit Field"}
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Label <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editingField.label}
                  onChange={(e) => setEditingField({ ...editingField, label: e.target.value })}
                  placeholder="e.g., Technical Knowledge"
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Type</label>
                <select
                  value={editingField.type}
                  onChange={(e) => setEditingField({ 
                    ...editingField, 
                    type: e.target.value as ScorecardFieldType,
                    // Reset type-specific fields
                    min: e.target.value === "rating" ? 1 : undefined,
                    max: e.target.value === "rating" ? 5 : undefined,
                    weight: e.target.value === "rating" ? editingField.weight : undefined,
                  })}
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                >
                  {FIELD_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              
              {editingField.type === "rating" && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Min</label>
                    <input
                      type="number"
                      value={editingField.min || 1}
                      onChange={(e) => setEditingField({ ...editingField, min: parseInt(e.target.value) })}
                      className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Max</label>
                    <input
                      type="number"
                      value={editingField.max || 5}
                      onChange={(e) => setEditingField({ ...editingField, max: parseInt(e.target.value) })}
                      className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Weight</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editingField.weight || ""}
                      onChange={(e) => setEditingField({ 
                        ...editingField, 
                        weight: e.target.value ? parseFloat(e.target.value) : undefined 
                      })}
                      placeholder="1.0"
                      className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Description</label>
                <input
                  type="text"
                  value={editingField.description || ""}
                  onChange={(e) => setEditingField({ ...editingField, description: e.target.value })}
                  placeholder="Helper text shown to reviewers"
                  className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="required"
                  checked={editingField.required || false}
                  onChange={(e) => setEditingField({ ...editingField, required: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-orange-600 focus:ring-orange-600 focus:ring-offset-neutral-900"
                />
                <label htmlFor="required" className="text-sm text-neutral-300">
                  Required field
                </label>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingField(null);
                  setEditingConfigId(null);
                }}
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                disabled={!editingField.label || saving}
                onClick={handleSaveField}
                className="flex-1 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-500 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Field"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
